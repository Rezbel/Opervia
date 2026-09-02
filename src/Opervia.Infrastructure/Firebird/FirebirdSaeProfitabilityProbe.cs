using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Profitability;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeProfitabilityProbe(
    ILogger<FirebirdSaeProfitabilityProbe> logger
) : ISaeProfitabilityProbe
{
    private const string BranchExpression =
        """
        CASE
          WHEN F.CVE_DOC STARTING WITH 'F-QR8' THEN 'CDMX'
          WHEN F.CVE_DOC STARTING WITH 'F-HT' OR F.CVE_DOC STARTING WITH 'HT0' THEN 'Huasteca'
          WHEN F.CVE_DOC STARTING WITH 'F-XA' OR F.CVE_DOC STARTING WITH 'F-EX' OR F.CVE_DOC STARTING WITH 'QRX' THEN 'Xalapa'
          WHEN F.CVE_DOC STARTING WITH 'F-SL' OR F.CVE_DOC STARTING WITH 'F-ES' OR F.CVE_DOC STARTING WITH 'SL2' THEN 'SLP'
          WHEN F.CVE_DOC STARTING WITH 'F-QR' OR F.CVE_DOC STARTING WITH 'F-EQ' OR F.CVE_DOC STARTING WITH 'QR5' THEN 'QRO'
          WHEN F.NUM_ALMA = 8 THEN 'CDMX'
          WHEN F.NUM_ALMA = 7 THEN 'GTO'
          WHEN F.NUM_ALMA = 4 THEN 'QRO'
          ELSE 'Sin clasificar'
        END
        """;

    public async Task<SaeProfitabilityResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly periodStart,
        DateOnly periodEnd,
        string? branch,
        string? sellerCode,
        CancellationToken cancellationToken = default
    )
    {
        if (periodEnd < periodStart)
            throw new ArgumentException("La fecha final no puede ser anterior a la inicial.");

        var invoiceTable = profile.ResolveTableName("FACTF");
        var linesTable = profile.ResolveTableName("PAR_FACTF");
        var purchaseTable = profile.ResolveTableName("COMPC");
        var sellersTable = profile.ResolveTableName("VEND");
        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(cancellationToken);

            var from = periodStart.ToDateTime(TimeOnly.MinValue);
            var toExclusive = periodEnd.AddDays(1).ToDateTime(TimeOnly.MinValue);

            var total = await ReadTotalAsync(connection, invoiceTable, linesTable,
                from, toExclusive, branch, sellerCode, cancellationToken);
            var purchases = await ReadPurchasesAsync(connection, purchaseTable,
                from, toExclusive, cancellationToken);
            var monthly = await ReadMonthlyAsync(connection, invoiceTable, linesTable,
                from, toExclusive, branch, sellerCode, cancellationToken);
            var branches = await ReadBreakdownAsync(connection, invoiceTable, linesTable,
                sellersTable, from, toExclusive, branch, sellerCode, true, cancellationToken);
            var sellers = await ReadBreakdownAsync(connection, invoiceTable, linesTable,
                sellersTable, from, toExclusive, branch, sellerCode, false, cancellationToken);
            var branchOptions = await ReadBranchOptionsAsync(connection, invoiceTable,
                from, toExclusive, cancellationToken);
            var sellerOptions = await ReadSellerOptionsAsync(connection, invoiceTable,
                sellersTable, from, toExclusive, cancellationToken);

            stopwatch.Stop();
            return new SaeProfitabilityResult(
                total.NetSales,
                total.NetSalesWithTax,
                total.CostOfSales,
                purchases.WithoutTax,
                purchases.WithTax,
                purchases.Count,
                total.InvoiceCount,
                monthly,
                branches,
                sellers,
                branchOptions,
                sellerOptions,
                invoiceTable,
                linesTable,
                purchaseTable,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Falló la consulta de rentabilidad SAE en modo de solo lectura.");
            throw;
        }
    }

    private static async Task<(decimal WithoutTax, decimal WithTax, int Count)> ReadPurchasesAsync(
        FbConnection connection, string purchaseTable, DateTime from, DateTime toExclusive,
        CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT
              COALESCE(SUM(ABS(COALESCE(C.CAN_TOT, 0) - COALESCE(C.DES_TOT, 0))), 0),
              COALESCE(SUM(ABS(COALESCE(C.IMPORTE, 0))), 0),
              COUNT(*)
            FROM {purchaseTable} C
            WHERE C.FECHA_DOC >= @from AND C.FECHA_DOC < @to
              AND COALESCE(C.STATUS, '') <> 'C'
              AND UPPER(COALESCE(C.TIP_DOC, '')) = 'C';
            """;
        command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
        command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
        await using var reader = await command.ExecuteReaderAsync(token);
        await reader.ReadAsync(token);
        return (ReadDecimal(reader, 0), ReadDecimal(reader, 1), reader.GetInt32(2));
    }

    private static async Task<(decimal NetSales, decimal NetSalesWithTax, decimal CostOfSales, int InvoiceCount)> ReadTotalAsync(
        FbConnection connection, string invoiceTable, string linesTable,
        DateTime from, DateTime toExclusive, string? branch, string? sellerCode,
        CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT COALESCE(SUM(COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)), 0)
            FROM {invoiceTable} F
            INNER JOIN {linesTable} P ON P.CVE_DOC = F.CVE_DOC
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              {BuildFilters(branch, sellerCode)};
            """;
        AddParameters(command, from, toExclusive, branch, sellerCode);
        await using var reader = await command.ExecuteReaderAsync(token);
        await reader.ReadAsync(token);
        var cost = ReadDecimal(reader, 0);
        await reader.DisposeAsync();

        await using var taxCommand = connection.CreateCommand();
        taxCommand.CommandText =
            $"""
            SELECT
              COALESCE(SUM(ABS(COALESCE(F.CAN_TOT, 0) - COALESCE(F.DES_TOT, 0))), 0),
              COALESCE(SUM(ABS(F.IMPORTE)), 0),
              COUNT(*)
            FROM {invoiceTable} F
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              {BuildFilters(branch, sellerCode)};
            """;
        AddParameters(taxCommand, from, toExclusive, branch, sellerCode);
        await using var taxReader = await taxCommand.ExecuteReaderAsync(token);
        await taxReader.ReadAsync(token);
        return (ReadDecimal(taxReader, 0), ReadDecimal(taxReader, 1), cost, taxReader.GetInt32(2));
    }

    private static async Task<IReadOnlyList<ProfitabilityPeriodPoint>> ReadMonthlyAsync(
        FbConnection connection, string invoiceTable, string linesTable,
        DateTime from, DateTime toExclusive, string? branch, string? sellerCode,
        CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT EXTRACT(YEAR FROM F.FECHA_DOC), EXTRACT(MONTH FROM F.FECHA_DOC),
              COALESCE(SUM(COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)), 0)
            FROM {invoiceTable} F
            INNER JOIN {linesTable} P ON P.CVE_DOC = F.CVE_DOC
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              {BuildFilters(branch, sellerCode)}
            GROUP BY EXTRACT(YEAR FROM F.FECHA_DOC), EXTRACT(MONTH FROM F.FECHA_DOC)
            ORDER BY 1, 2;
            """;
        AddParameters(command, from, toExclusive, branch, sellerCode);
        await using var reader = await command.ExecuteReaderAsync(token);
        var costs = new Dictionary<(int Year, int Month), decimal>();
        while (await reader.ReadAsync(token))
            costs[(reader.GetInt32(0), reader.GetInt32(1))] = ReadDecimal(reader, 2);
        await reader.DisposeAsync();

        await using var taxCommand = connection.CreateCommand();
        taxCommand.CommandText =
            $"""
            SELECT EXTRACT(YEAR FROM F.FECHA_DOC), EXTRACT(MONTH FROM F.FECHA_DOC),
              COALESCE(SUM(ABS(COALESCE(F.CAN_TOT, 0) - COALESCE(F.DES_TOT, 0))), 0),
              COALESCE(SUM(ABS(F.IMPORTE)), 0),
              COUNT(*)
            FROM {invoiceTable} F
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              {BuildFilters(branch, sellerCode)}
            GROUP BY 1, 2;
            """;
        AddParameters(taxCommand, from, toExclusive, branch, sellerCode);
        await using var taxReader = await taxCommand.ExecuteReaderAsync(token);
        var items = new List<ProfitabilityPeriodPoint>();
        while (await taxReader.ReadAsync(token))
        {
            var period = (taxReader.GetInt32(0), taxReader.GetInt32(1));
            items.Add(new(period.Item1, period.Item2, ReadDecimal(taxReader, 2),
                ReadDecimal(taxReader, 3), costs.GetValueOrDefault(period), taxReader.GetInt32(4)));
        }
        return items;
    }

    private static async Task<IReadOnlyList<ProfitabilityBreakdownItem>> ReadBreakdownAsync(
        FbConnection connection, string invoiceTable, string linesTable, string sellersTable,
        DateTime from, DateTime toExclusive, string? branch, string? sellerCode,
        bool byBranch, CancellationToken token)
    {
        var key = byBranch ? BranchExpression : "COALESCE(NULLIF(TRIM(F.CVE_VEND), ''), 'SIN VENDEDOR')";
        var label = byBranch ? BranchExpression : "COALESCE(NULLIF(TRIM(V.NOMBRE), ''), NULLIF(TRIM(F.CVE_VEND), ''), 'Sin vendedor')";
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT {key}, {label},
              COALESCE(SUM(COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)), 0)
            FROM {invoiceTable} F
            INNER JOIN {linesTable} P ON P.CVE_DOC = F.CVE_DOC
            LEFT JOIN {sellersTable} V ON V.CVE_VEND = F.CVE_VEND
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              {BuildFilters(branch, sellerCode)}
            GROUP BY 1, 2
            ORDER BY 3 DESC;
            """;
        AddParameters(command, from, toExclusive, branch, sellerCode);
        await using var reader = await command.ExecuteReaderAsync(token);
        var costs = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        while (await reader.ReadAsync(token))
        {
            var itemKey = $"{reader.GetString(0).Trim()}\u001f{reader.GetString(1).Trim()}";
            costs[itemKey] = ReadDecimal(reader, 2);
        }
        await reader.DisposeAsync();

        await using var taxCommand = connection.CreateCommand();
        taxCommand.CommandText =
            $"""
            SELECT {key}, {label},
              COALESCE(SUM(ABS(COALESCE(F.CAN_TOT, 0) - COALESCE(F.DES_TOT, 0))), 0),
              COALESCE(SUM(ABS(F.IMPORTE)), 0),
              COUNT(*)
            FROM {invoiceTable} F
            LEFT JOIN {sellersTable} V ON V.CVE_VEND = F.CVE_VEND
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              {BuildFilters(branch, sellerCode)}
            GROUP BY 1, 2;
            """;
        AddParameters(taxCommand, from, toExclusive, branch, sellerCode);
        await using var taxReader = await taxCommand.ExecuteReaderAsync(token);
        var items = new List<ProfitabilityBreakdownItem>();
        while (await taxReader.ReadAsync(token))
        {
            var itemKey = taxReader.GetString(0).Trim();
            var itemLabel = taxReader.GetString(1).Trim();
            var compositeKey = $"{itemKey}\u001f{itemLabel}";
            items.Add(new(itemKey, itemLabel, ReadDecimal(taxReader, 2),
                ReadDecimal(taxReader, 3), costs.GetValueOrDefault(compositeKey), taxReader.GetInt32(4)));
        }
        return items.OrderByDescending(item => item.NetSales).ToArray();
    }

    private static async Task<IReadOnlyList<ProfitabilityFilterOption>> ReadBranchOptionsAsync(
        FbConnection connection, string invoiceTable, DateTime from, DateTime toExclusive,
        CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT DISTINCT {BranchExpression}
            FROM {invoiceTable} F
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
            ORDER BY 1;
            """;
        command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
        command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
        await using var reader = await command.ExecuteReaderAsync(token);
        var items = new List<ProfitabilityFilterOption>();
        while (await reader.ReadAsync(token))
        {
            var value = reader.GetString(0).Trim();
            items.Add(new(value, value));
        }
        return items;
    }

    private static async Task<IReadOnlyList<ProfitabilityFilterOption>> ReadSellerOptionsAsync(
        FbConnection connection, string invoiceTable, string sellersTable,
        DateTime from, DateTime toExclusive, CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT DISTINCT COALESCE(NULLIF(TRIM(F.CVE_VEND), ''), 'SIN VENDEDOR'),
              COALESCE(NULLIF(TRIM(V.NOMBRE), ''), NULLIF(TRIM(F.CVE_VEND), ''), 'Sin vendedor')
            FROM {invoiceTable} F
            LEFT JOIN {sellersTable} V ON V.CVE_VEND = F.CVE_VEND
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
            ORDER BY 2;
            """;
        command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
        command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
        await using var reader = await command.ExecuteReaderAsync(token);
        var items = new List<ProfitabilityFilterOption>();
        while (await reader.ReadAsync(token))
            items.Add(new(reader.GetString(0).Trim(), reader.GetString(1).Trim()));
        return items;
    }

    private static string BuildFilters(string? branch, string? sellerCode)
    {
        var clauses = new List<string>();
        if (!string.IsNullOrWhiteSpace(branch))
            clauses.Add($"AND ({BranchExpression}) = @branch");
        if (!string.IsNullOrWhiteSpace(sellerCode))
            clauses.Add("AND F.CVE_VEND = @seller");
        return string.Join(Environment.NewLine, clauses);
    }

    private static void AddParameters(FbCommand command, DateTime from, DateTime toExclusive,
        string? branch, string? sellerCode)
    {
        command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
        command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
        if (!string.IsNullOrWhiteSpace(branch))
            command.Parameters.Add("@branch", FbDbType.VarChar).Value = branch.Trim();
        if (!string.IsNullOrWhiteSpace(sellerCode))
            command.Parameters.Add("@seller", FbDbType.VarChar).Value = sellerCode.Trim();
    }

    private static decimal ReadDecimal(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? 0m : Convert.ToDecimal(reader.GetValue(ordinal));
}
