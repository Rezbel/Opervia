using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Flows;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeSalesFlowSummaryProbe(
    ILogger<FirebirdSaeSalesFlowSummaryProbe> logger
) : ISaeSalesFlowSummaryProbe
{
    private const int AttentionAgeDays = 7;

    public async Task<SaeSalesFlowSummaryResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly from,
        DateOnly to,
        string? sellerCode,
        CancellationToken cancellationToken = default,
        string? documentKind = null,
        int page = 1,
        int pageSize = 50,
        string? branchCode = null,
        string? search = null)
    {
        var stopwatch = Stopwatch.StartNew();
        var tables = new[]
        {
            new StageDefinition("Quotation", "Cotizaciones", "Pedido", "C", profile.ResolveTableName("FACTC")),
            new StageDefinition("Order", "Pedidos", "Remisión o factura", "P", profile.ResolveTableName("FACTP")),
            new StageDefinition("Delivery", "Remisiones", "Factura", "R", profile.ResolveTableName("FACTR")),
            new StageDefinition("Invoice", "Facturas", string.Empty, "F", profile.ResolveTableName("FACTF"))
        };

        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(cancellationToken);

            // Se amplía solo la ventana de lectura para validar antecedentes y avances tardíos.
            // Todos los indicadores siguen usando estrictamente el periodo solicitado.
            var readFrom = from.AddDays(-180);
            var today = DateOnly.FromDateTime(DateTime.Today);
            var readTo = to.AddDays(180) < today ? to.AddDays(180) : today;
            if (readTo < to) readTo = to;

            var documentsByKind = new Dictionary<string, IReadOnlyList<FlowDocument>>(
                StringComparer.OrdinalIgnoreCase);
            var customerNames = await ReadCustomerNamesAsync(connection, profile.ResolveTableName("CLIE"), cancellationToken);
            foreach (var stage in tables)
            {
                documentsByKind[stage.Kind] = await ReadDocumentsAsync(
                    connection, stage.Table, readFrom, readTo, cancellationToken);
            }

            bool IsInPeriod(FlowDocument item) =>
                item.DocumentDate >= from && item.DocumentDate <= to;
            bool IsSelectedSeller(FlowDocument item) =>
                string.IsNullOrWhiteSpace(sellerCode)
                || string.Equals(item.SellerCode, sellerCode, StringComparison.OrdinalIgnoreCase);
            bool IsSelectedBranch(FlowDocument item) =>
                string.IsNullOrWhiteSpace(branchCode)
                || BranchFor(item.DocumentNumber) == branchCode;
            var normalizedSearch = search?.Trim();
            bool IsSearchMatch(FlowDocument item) =>
                string.IsNullOrWhiteSpace(normalizedSearch)
                || item.DocumentNumber.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase)
                || item.CustomerCode.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase)
                || (customerNames.GetValueOrDefault(item.CustomerCode)?.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase) ?? false)
                || (item.SellerCode?.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase) ?? false);

            var cohorts = tables.ToDictionary(
                stage => stage.Kind,
                stage => documentsByKind[stage.Kind]
                    .Where(item => IsInPeriod(item) && IsSelectedSeller(item) && IsSelectedBranch(item) && IsSearchMatch(item))
                    .ToArray(),
                StringComparer.OrdinalIgnoreCase);

            var stageMetrics = tables.Select(stage =>
            {
                var cohort = cohorts[stage.Kind];
                var active = cohort.Where(item => !item.IsCancelled).ToArray();
                return new SaeSalesFlowStageMetric(
                    stage.Kind,
                    stage.Label,
                    cohort.Length,
                    active.Length,
                    cohort.Length - active.Length,
                    active.Sum(item => item.AmountBeforeTax),
                    active.Sum(item => item.AmountWithTax));
            }).ToArray();

            var transitions = new[]
            {
                CreateTransition(tables[0], tables[1], cohorts, documentsByKind),
                CreateTransition(tables[1], tables[2], cohorts, documentsByKind),
                CreateTransition(tables[2], tables[3], cohorts, documentsByKind)
            };

            var recentQuotationWithoutOrderCount =
                CountRecentDocumentsWithoutNextStage(
                    tables[0],
                    tables[1],
                    cohorts,
                    documentsByKind);

            var bottlenecks = new List<SaeSalesFlowBottleneck>();
            bottlenecks.AddRange(CreateBottlenecks(
                tables[0], [tables[1]], cohorts, documentsByKind));
            bottlenecks.AddRange(CreateBottlenecks(
                tables[1], [tables[2], tables[3]], cohorts, documentsByKind));
            bottlenecks.AddRange(CreateBottlenecks(
                tables[2], [tables[3]], cohorts, documentsByKind));

            var sellerOptions = tables
                .SelectMany(stage => documentsByKind[stage.Kind])
                .Where(IsInPeriod)
                .Where(item => !string.IsNullOrWhiteSpace(item.SellerCode))
                .GroupBy(item => item.SellerCode!, StringComparer.OrdinalIgnoreCase)
                .Select(group => new SaeSalesFlowSellerOption(group.Key, group.Key, group.Count()))
                .OrderBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            var skippedStageCount = tables
                .Skip(1)
                .SelectMany(stage => cohorts[stage.Kind]
                    .Where(item => !item.IsCancelled
                        && !string.IsNullOrWhiteSpace(item.PreviousDocumentNumber)
                        && !string.Equals(
                            item.PreviousDocumentType,
                            tables[Array.IndexOf(tables, stage) - 1].TypeCode,
                            StringComparison.OrdinalIgnoreCase)))
                .Count();

            var documentNumbers = tables.ToDictionary(
                stage => stage.TypeCode,
                stage => documentsByKind[stage.Kind]
                    .Select(item => item.DocumentNumber)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase),
                StringComparer.OrdinalIgnoreCase);
            var brokenLinkCount = tables
                .Skip(1)
                .SelectMany(stage => cohorts[stage.Kind])
                .Count(item => !item.IsCancelled
                    && !string.IsNullOrWhiteSpace(item.PreviousDocumentNumber)
                    && !string.IsNullOrWhiteSpace(item.PreviousDocumentType)
                    && documentNumbers.TryGetValue(item.PreviousDocumentType, out var sourceNumbers)
                    && !sourceNumbers.Contains(item.PreviousDocumentNumber));

            page = Math.Max(page, 1);
            pageSize = Math.Clamp(pageSize, 10, 100);
            var allDocuments = tables
                .Where(stage => documentKind == null || stage.Kind == documentKind)
                .SelectMany(stage => cohorts[stage.Kind]
                    .Select(item => new SaeSalesFlowDocumentListItem(
                        stage.Kind,
                        StageSingular(stage.Kind),
                        item.DocumentNumber,
                        item.CustomerCode,
                        customerNames.GetValueOrDefault(item.CustomerCode),
                        item.SellerCode,
                        item.DocumentDate.ToDateTime(TimeOnly.MinValue),
                        item.IsCancelled,
                        item.AmountBeforeTax,
                        item.AmountWithTax)))
                .OrderByDescending(item => item.DocumentDate)
                .ThenByDescending(item => item.DocumentNumber)
                .ToArray();
            var documents = allDocuments.Skip((page - 1) * pageSize).Take(pageSize).ToArray();

            stopwatch.Stop();
            return new SaeSalesFlowSummaryResult(
                true,
                "Análisis operativo reconstruido exclusivamente con documentos SAE.",
                from,
                to,
                sellerCode,
                stageMetrics,
                transitions,
                bottlenecks.OrderByDescending(item => item.WaitingDays).Take(18).ToArray(),
                sellerOptions,
                skippedStageCount,
                brokenLinkCount,
                recentQuotationWithoutOrderCount,
                documents,
                page,
                pageSize,
                allDocuments.Length,
                stopwatch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();
            return Failure("La consulta fue cancelada.", from, to, sellerCode, stopwatch.ElapsedMilliseconds);
        }
        catch (FbException exception)
        {
            stopwatch.Stop();
            logger.LogWarning(exception, "Firebird rechazó el análisis agregado de flujos.");
            return Failure("Firebird rechazó la consulta de flujos.", from, to, sellerCode, stopwatch.ElapsedMilliseconds);
        }
        catch (Exception exception)
        {
            stopwatch.Stop();
            logger.LogError(exception, "Falló el análisis agregado de flujos SAE.");
            return Failure("No fue posible analizar los flujos de venta.", from, to, sellerCode, stopwatch.ElapsedMilliseconds);
        }
    }

    private static SaeSalesFlowTransitionMetric CreateTransition(
        StageDefinition sourceStage,
        StageDefinition targetStage,
        IReadOnlyDictionary<string, FlowDocument[]> cohorts,
        IReadOnlyDictionary<string, IReadOnlyList<FlowDocument>> documentsByKind)
    {
        // La conversión es una fotografía en tiempo real: todo documento
        // fuente vigente del periodo participa, aunque se haya creado hoy.
        var considered = cohorts[sourceStage.Kind]
            .Where(item => !item.IsCancelled)
            .ToArray();
        var sourceNumbers = considered.Select(item => item.DocumentNumber)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var linkedTargets = documentsByKind[targetStage.Kind]
            .Where(item => !item.IsCancelled
                && !string.IsNullOrWhiteSpace(item.PreviousDocumentNumber)
                && sourceNumbers.Contains(item.PreviousDocumentNumber))
            .GroupBy(item => item.PreviousDocumentNumber!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.MinBy(item => item.DocumentDate)!,
                StringComparer.OrdinalIgnoreCase);
        var progressed = considered.Where(item => linkedTargets.ContainsKey(item.DocumentNumber)).ToArray();
        var averageDays = progressed.Length == 0
            ? (decimal?)null
            : Math.Round((decimal)progressed.Average(item =>
                Math.Max(0, linkedTargets[item.DocumentNumber].DocumentDate.DayNumber - item.DocumentDate.DayNumber)), 1);
        var conversion = considered.Length == 0
            ? 0
            : Math.Round(progressed.Length * 100m / considered.Length, 1);

        return new SaeSalesFlowTransitionMetric(
            sourceStage.Kind,
            targetStage.Kind,
            $"{StageSingular(sourceStage.Kind)} → {StageSingular(targetStage.Kind).ToLowerInvariant()}",
            considered.Length,
            progressed.Length,
            conversion,
            averageDays);
    }

    private static int CountRecentDocumentsWithoutNextStage(
        StageDefinition sourceStage,
        StageDefinition targetStage,
        IReadOnlyDictionary<string, FlowDocument[]> cohorts,
        IReadOnlyDictionary<string, IReadOnlyList<FlowDocument>> documentsByKind)
    {
        var linkedSources = documentsByKind[targetStage.Kind]
            .Where(item => !item.IsCancelled
                && !string.IsNullOrWhiteSpace(item.PreviousDocumentNumber))
            .Select(item => item.PreviousDocumentNumber!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var today = DateOnly.FromDateTime(DateTime.Today);

        return cohorts[sourceStage.Kind]
            .Count(item =>
            {
                var ageDays = today.DayNumber - item.DocumentDate.DayNumber;
                return !item.IsCancelled
                    && ageDays is >= 0 and < AttentionAgeDays
                    && !linkedSources.Contains(item.DocumentNumber);
            });
    }

    private static IReadOnlyList<SaeSalesFlowBottleneck> CreateBottlenecks(
        StageDefinition sourceStage,
        IReadOnlyList<StageDefinition> targetStages,
        IReadOnlyDictionary<string, FlowDocument[]> cohorts,
        IReadOnlyDictionary<string, IReadOnlyList<FlowDocument>> documentsByKind)
    {
        var progressedNumbers = targetStages
            .SelectMany(stage => documentsByKind[stage.Kind])
            .Where(item => !item.IsCancelled && !string.IsNullOrWhiteSpace(item.PreviousDocumentNumber))
            .Select(item => item.PreviousDocumentNumber!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var today = DateOnly.FromDateTime(DateTime.Today);

        return cohorts[sourceStage.Kind]
            .Where(item => !item.IsCancelled
                && today.DayNumber - item.DocumentDate.DayNumber >= AttentionAgeDays
                && !progressedNumbers.Contains(item.DocumentNumber))
            .OrderBy(item => item.DocumentDate)
            .Take(20)
            .Select(item => new SaeSalesFlowBottleneck(
                sourceStage.Kind,
                StageSingular(sourceStage.Kind),
                sourceStage.ExpectedNextStage,
                item.DocumentNumber,
                item.CustomerCode,
                item.SellerCode,
                item.DocumentDate.ToDateTime(TimeOnly.MinValue),
                today.DayNumber - item.DocumentDate.DayNumber,
                item.AmountBeforeTax,
                item.AmountWithTax))
            .ToArray();
    }

    private static async Task<IReadOnlyList<FlowDocument>> ReadDocumentsAsync(
        FbConnection connection,
        string table,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT
                CVE_DOC,
                CVE_CLPV,
                CVE_VEND,
                FECHA_DOC,
                FECHA_CANCELA,
                COALESCE(CAN_TOT, 0) - COALESCE(DES_TOT, 0),
                COALESCE(IMPORTE, 0),
                TIP_DOC_ANT,
                DOC_ANT
            FROM {table}
            WHERE FECHA_DOC >= @FROM_DATE
              AND FECHA_DOC < @TO_DATE
            """;
        await using var command = new FbCommand(sql, connection) { CommandTimeout = 30 };
        command.Parameters.AddWithValue("@FROM_DATE", from.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("@TO_DATE", to.AddDays(1).ToDateTime(TimeOnly.MinValue));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new List<FlowDocument>();
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new FlowDocument(
                Text(reader, 0),
                Text(reader, 1),
                NullableText(reader, 2),
                DateOnly.FromDateTime(reader.GetDateTime(3)),
                !reader.IsDBNull(4),
                Value<decimal>(reader, 5),
                Value<decimal>(reader, 6),
                NullableText(reader, 7)?.ToUpperInvariant(),
                NullableText(reader, 8)));
        }

        return result;
    }

    private static async Task<Dictionary<string, string>> ReadCustomerNamesAsync(
        FbConnection connection, string table, CancellationToken cancellationToken)
    {
        await using var command = new FbCommand($"SELECT CLAVE, NOMBRE FROM {table}", connection) { CommandTimeout = 30 };
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        while (await reader.ReadAsync(cancellationToken))
        {
            var key = Text(reader, 0);
            var name = NullableText(reader, 1);
            if (!string.IsNullOrWhiteSpace(key) && !string.IsNullOrWhiteSpace(name)) result[key] = name;
        }
        return result;
    }

    private static T Value<T>(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal)
            ? default!
            : (T)Convert.ChangeType(reader.GetValue(ordinal), typeof(T));

    private static string Text(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? string.Empty : reader.GetString(ordinal).Trim();

    private static string? NullableText(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();

    private static string StageSingular(string kind) => kind switch
    {
        "Quotation" => "Cotización",
        "Order" => "Pedido",
        "Delivery" => "Remisión",
        "Invoice" => "Factura",
        _ => "Documento"
    };

    private static string? BranchFor(string number)
    {
        var value = number.Trim().ToUpperInvariant();
        return value switch
        {
            _ when value.StartsWith("P-QR") => "QR",
            _ when value.StartsWith("P-SL") => "SL",
            _ when value.StartsWith("P-XA") => "XA",
            _ when value.StartsWith("P-HT") => "HT",
            _ when value.StartsWith("P-EH") => "EH",
            _ when value.StartsWith("P-EQ") => "EQ",
            _ when value.StartsWith("P-ES") => "ES",
            _ when value.StartsWith("P-EX") => "EX",
            _ => null
        };
    }

    private static SaeSalesFlowSummaryResult Failure(
        string message,
        DateOnly from,
        DateOnly to,
        string? seller,
        long elapsedMilliseconds) =>
        new(false, message, from, to, seller, [], [], [], [], 0, 0, 0, [], 1, 50, 0, elapsedMilliseconds);

    private sealed record StageDefinition(
        string Kind,
        string Label,
        string ExpectedNextStage,
        string TypeCode,
        string Table);

    private sealed record FlowDocument(
        string DocumentNumber,
        string CustomerCode,
        string? SellerCode,
        DateOnly DocumentDate,
        bool IsCancelled,
        decimal AmountBeforeTax,
        decimal AmountWithTax,
        string? PreviousDocumentType,
        string? PreviousDocumentNumber);
}
