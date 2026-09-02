using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeReceivablesSummaryProbe(
    ILogger<FirebirdSaeReceivablesSummaryProbe> logger
) : ISaeReceivablesSummaryProbe
{
    private const int MaximumRecentRecords = 8;
    private const int RecentReductionCandidates = 100;

    public async Task<SaeReceivablesSummaryResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly periodStart,
        DateOnly periodEnd,
        SaeReceivablesSummaryFilter filters,
        CancellationToken cancellationToken = default
    )
    {
        ValidatePeriod(periodStart, periodEnd);
        filters = NormalizeFilters(filters);

        var invoiceTableName =
            profile.ResolveTableName("FACTF");
        var movementsTableName =
            profile.ResolveTableName("CUEN_DET");
        var conceptsTableName =
            profile.ResolveTableName("CONC");

        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var connection =
                FirebirdConnectionFactory.Create(
                    profile,
                    password
                );

            await connection.OpenAsync(cancellationToken);

            var from = periodStart.ToDateTime(TimeOnly.MinValue);
            var toExclusive = periodEnd
                .AddDays(1)
                .ToDateTime(TimeOnly.MinValue);

            var invoiceSummary =
                await ReadInvoiceSummaryAsync(
                    connection,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var cancellationSummary =
                await ReadCancellationSummaryAsync(
                    connection,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var invoiceDaily =
                await ReadInvoiceDailyAsync(
                    connection,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var invoiceDailyWithoutTax =
                await ReadInvoiceDailyWithoutTaxAsync(
                    connection,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var reductions =
                await ReadReductionAggregatesAsync(
                    connection,
                    movementsTableName,
                    conceptsTableName,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var filterOptions =
                await ReadFilterOptionsAsync(
                    connection,
                    invoiceTableName,
                    movementsTableName,
                    conceptsTableName,
                    profile.ResolveTableName("VEND"),
                    from,
                    toExclusive,
                    cancellationToken
                );

            var classifiedReductions =
                ClassifyReductions(reductions);

            var recentPayments =
                await ReadRecentPaymentsAsync(
                    connection,
                    movementsTableName,
                    conceptsTableName,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var recentCancellations =
                await ReadRecentCancellationsAsync(
                    connection,
                    invoiceTableName,
                    from,
                    toExclusive,
                    filters,
                    cancellationToken
                );

            var futureDatedReductionCount =
                await ReadFutureReductionCountAsync(
                    connection,
                    movementsTableName,
                    conceptsTableName,
                    invoiceTableName,
                    filters,
                    cancellationToken
                );

            var dailySeries = BuildDailySeries(
                periodStart,
                periodEnd,
                invoiceDaily,
                classifiedReductions.RealIncomeDaily,
                invoiceDailyWithoutTax
            );

            stopwatch.Stop();

            return new SaeReceivablesSummaryResult(
                true,
                "Se calculó el resumen financiero de cobranza.",
                periodStart,
                periodEnd,
                filters,
                filterOptions,
                invoiceSummary.GrossAmount,
                invoiceSummary.NetAmount,
                invoiceSummary.InvoiceCount,
                invoiceSummary.NetInvoiceCount,
                invoiceSummary.VoidedAmount,
                invoiceSummary.VoidedCount,
                cancellationSummary.Amount,
                cancellationSummary.Count,
                classifiedReductions.RealIncomeAmount,
                classifiedReductions.RealPaymentCount,
                classifiedReductions.ReturnsAndCreditsAmount,
                classifiedReductions.ReturnAndCreditCount,
                classifiedReductions.AppliedAdvanceAmount,
                classifiedReductions.AppliedAdvanceCount,
                classifiedReductions.OtherReductionAmount,
                classifiedReductions.OtherReductionCount,
                classifiedReductions.IncomeBreakdown,
                classifiedReductions.NonCashBreakdown,
                dailySeries,
                recentPayments,
                recentCancellations,
                futureDatedReductionCount,
                invoiceSummary.GrossAmountWithoutTax,
                invoiceSummary.NetAmountWithoutTax,
                invoiceSummary.VoidedAmountWithoutTax,
                cancellationSummary.AmountWithoutTax,
                invoiceTableName,
                movementsTableName,
                conceptsTableName,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return CreateFailure(
                periodStart,
                periodEnd,
                filters,
                invoiceTableName,
                movementsTableName,
                conceptsTableName,
                "La consulta fue cancelada.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló el resumen financiero de cuentas por cobrar."
            );

            return CreateFailure(
                periodStart,
                periodEnd,
                filters,
                invoiceTableName,
                movementsTableName,
                conceptsTableName,
                "No fue posible calcular el resumen financiero.",
                stopwatch.ElapsedMilliseconds
            );
        }
    }

    private static async Task<InvoiceSummary> ReadInvoiceSummaryAsync(
        FbConnection connection,
        string tableName,
        DateTime from,
        DateTime toExclusive,
        SaeReceivablesSummaryFilter filters,
        CancellationToken cancellationToken
    )
    {
        var filterClause =
            BuildInvoiceFilterClause(filters, "I");
        var sql = $"""
            SELECT
                COUNT(*),
                COALESCE(SUM(ABS(I.IMPORTE)), 0),
                COALESCE(SUM(
                    CASE
                        WHEN COALESCE(I.STATUS, '') <> 'C'
                        THEN ABS(I.IMPORTE)
                        ELSE 0
                    END
                ), 0),
                COALESCE(SUM(
                    CASE
                        WHEN COALESCE(I.STATUS, '') <> 'C'
                        THEN 1
                        ELSE 0
                    END
                ), 0),
                COALESCE(SUM(
                    CASE
                        WHEN I.STATUS = 'C'
                        THEN ABS(I.IMPORTE)
                        ELSE 0
                    END
                ), 0),
                COALESCE(SUM(
                    CASE
                        WHEN I.STATUS = 'C'
                        THEN 1
                        ELSE 0
                    END
                ), 0),
                COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0),
                COALESCE(SUM(
                    CASE WHEN COALESCE(I.STATUS, '') <> 'C'
                    THEN ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0)) ELSE 0 END
                ), 0),
                COALESCE(SUM(
                    CASE WHEN I.STATUS = 'C'
                    THEN ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0)) ELSE 0 END
                ), 0)
            FROM {tableName} I
            WHERE I.FECHA_DOC >= @FROM_DATE
              AND I.FECHA_DOC < @TO_DATE
              AND {filterClause}
            """;

        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );
        AddFilterParameters(command, filters);

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        await reader.ReadAsync(cancellationToken);

        return new InvoiceSummary(
            GetInt32(reader, 0),
            GetDecimal(reader, 1),
            GetDecimal(reader, 2),
            GetInt32(reader, 3),
            GetDecimal(reader, 4),
            GetInt32(reader, 5),
            GetDecimal(reader, 6),
            GetDecimal(reader, 7),
            GetDecimal(reader, 8)
        );
    }

    private static async Task<CancellationSummary>
        ReadCancellationSummaryAsync(
            FbConnection connection,
            string tableName,
            DateTime from,
            DateTime toExclusive,
            SaeReceivablesSummaryFilter filters,
            CancellationToken cancellationToken
        )
    {
        var filterClause =
            BuildInvoiceFilterClause(filters, "I");
        var sql = $"""
            SELECT
                COUNT(*),
                COALESCE(SUM(ABS(I.IMPORTE)), 0),
                COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0)
            FROM {tableName} I
            WHERE I.STATUS = 'C'
              AND I.FECHA_CANCELA >= @FROM_DATE
              AND I.FECHA_CANCELA < @TO_DATE
              AND {filterClause}
            """;

        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );
        AddFilterParameters(command, filters);

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        await reader.ReadAsync(cancellationToken);

        return new CancellationSummary(
            GetDecimal(reader, 1),
            GetInt32(reader, 0),
            GetDecimal(reader, 2)
        );
    }

    private static async Task<Dictionary<DateOnly, decimal>>
        ReadInvoiceDailyAsync(
            FbConnection connection,
            string tableName,
            DateTime from,
            DateTime toExclusive,
            SaeReceivablesSummaryFilter filters,
            CancellationToken cancellationToken
        )
    {
        var filterClause =
            BuildInvoiceFilterClause(filters, "I");
        var sql = $"""
            SELECT
                CAST(I.FECHA_DOC AS DATE),
                COALESCE(SUM(
                    CASE
                        WHEN COALESCE(I.STATUS, '') <> 'C'
                        THEN ABS(I.IMPORTE)
                        ELSE 0
                    END
                ), 0)
            FROM {tableName} I
            WHERE I.FECHA_DOC >= @FROM_DATE
              AND I.FECHA_DOC < @TO_DATE
              AND {filterClause}
            GROUP BY CAST(I.FECHA_DOC AS DATE)
            ORDER BY CAST(I.FECHA_DOC AS DATE)
            """;

        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );
        AddFilterParameters(command, filters);

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        var values = new Dictionary<DateOnly, decimal>();

        while (await reader.ReadAsync(cancellationToken))
        {
            values[DateOnly.FromDateTime(reader.GetDateTime(0))] =
                GetDecimal(reader, 1);
        }

        return values;
    }

    private static async Task<List<ReductionAggregate>>
        ReadReductionAggregatesAsync(
            FbConnection connection,
            string movementsTableName,
            string conceptsTableName,
            string invoiceTableName,
            DateTime from,
            DateTime toExclusive,
            SaeReceivablesSummaryFilter filters,
            CancellationToken cancellationToken
        )
    {
        var filterClause =
            BuildReductionFilterClause(filters);
        var sql = $"""
            SELECT
                CAST(D.FECHA_APLI AS DATE),
                D.NUM_CPTO,
                COALESCE(C.DESCR, 'Concepto sin descripción'),
                COALESCE(SUM(ABS(D.IMPORTE)), 0),
                COUNT(*)
            FROM {movementsTableName} D
            LEFT JOIN {conceptsTableName} C
                ON C.NUM_CPTO = D.NUM_CPTO
            LEFT JOIN {invoiceTableName} I
                ON I.CVE_DOC = D.NO_FACTURA
            WHERE D.FECHA_APLI >= @FROM_DATE
              AND D.FECHA_APLI < @TO_DATE
              AND (
                    CASE
                        WHEN D.SIGNO IS NULL OR D.SIGNO = 0
                        THEN C.SIGNO
                        ELSE D.SIGNO
                    END
                  ) < 0
              AND {filterClause}
            GROUP BY
                CAST(D.FECHA_APLI AS DATE),
                D.NUM_CPTO,
                C.DESCR
            ORDER BY CAST(D.FECHA_APLI AS DATE)
            """;

        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );
        AddFilterParameters(
            command,
            filters,
            includePaymentConcept: true
        );

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        var values = new List<ReductionAggregate>();

        while (await reader.ReadAsync(cancellationToken))
        {
            values.Add(
                new ReductionAggregate(
                    DateOnly.FromDateTime(reader.GetDateTime(0)),
                    GetInt32(reader, 1),
                    GetString(reader, 2) ??
                        "Concepto sin descripción",
                    GetDecimal(reader, 3),
                    GetInt32(reader, 4)
                )
            );
        }

        return values;
    }

    private static async Task<Dictionary<DateOnly, decimal>>
        ReadInvoiceDailyWithoutTaxAsync(
            FbConnection connection,
            string tableName,
            DateTime from,
            DateTime toExclusive,
            SaeReceivablesSummaryFilter filters,
            CancellationToken cancellationToken
        )
    {
        var filterClause = BuildInvoiceFilterClause(filters, "I");
        var sql = $"""
            SELECT CAST(I.FECHA_DOC AS DATE),
                COALESCE(SUM(
                    CASE WHEN COALESCE(I.STATUS, '') <> 'C'
                    THEN ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))
                    ELSE 0 END
                ), 0)
            FROM {tableName} I
            WHERE I.FECHA_DOC >= @FROM_DATE
              AND I.FECHA_DOC < @TO_DATE
              AND {filterClause}
            GROUP BY CAST(I.FECHA_DOC AS DATE)
            ORDER BY CAST(I.FECHA_DOC AS DATE)
            """;
        await using var command = CreatePeriodCommand(sql, connection, from, toExclusive);
        AddFilterParameters(command, filters);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var values = new Dictionary<DateOnly, decimal>();
        while (await reader.ReadAsync(cancellationToken))
            values[DateOnly.FromDateTime(reader.GetDateTime(0))] = GetDecimal(reader, 1);
        return values;
    }

    private static ClassifiedReductions ClassifyReductions(
        IReadOnlyCollection<ReductionAggregate> reductions
    )
    {
        decimal realIncomeAmount = 0;
        var realPaymentCount = 0;
        decimal returnsAndCreditsAmount = 0;
        var returnAndCreditCount = 0;
        decimal appliedAdvanceAmount = 0;
        var appliedAdvanceCount = 0;
        decimal otherReductionAmount = 0;
        var otherReductionCount = 0;

        var conceptTotals =
            new Dictionary<
                (int ConceptNumber, string Description,
                    SaeReceivableReductionKind Kind),
                AmountAndCount
            >();

        var realIncomeDaily =
            new Dictionary<DateOnly, decimal>();

        foreach (var reduction in reductions)
        {
            var kind =
                SaeReceivableConceptClassifier.Classify(
                    reduction.ConceptNumber,
                    reduction.Description
                );

            var key = (
                reduction.ConceptNumber,
                reduction.Description,
                kind
            );

            conceptTotals.TryGetValue(
                key,
                out var currentConceptTotal
            );

            conceptTotals[key] = new AmountAndCount(
                currentConceptTotal.Amount + reduction.Amount,
                currentConceptTotal.Count + reduction.Count
            );

            switch (kind)
            {
                case SaeReceivableReductionKind.RealPayment:
                    realIncomeAmount += reduction.Amount;
                    realPaymentCount += reduction.Count;
                    realIncomeDaily.TryGetValue(
                        reduction.Date,
                        out var currentDailyIncome
                    );
                    realIncomeDaily[reduction.Date] =
                        currentDailyIncome + reduction.Amount;
                    break;

                case SaeReceivableReductionKind.ReturnOrCredit:
                    returnsAndCreditsAmount += reduction.Amount;
                    returnAndCreditCount += reduction.Count;
                    break;

                case SaeReceivableReductionKind.AppliedAdvance:
                    appliedAdvanceAmount += reduction.Amount;
                    appliedAdvanceCount += reduction.Count;
                    break;

                default:
                    otherReductionAmount += reduction.Amount;
                    otherReductionCount += reduction.Count;
                    break;
            }
        }

        var totals = conceptTotals
            .Select(item => new SaeReceivableConceptTotal(
                item.Key.ConceptNumber,
                item.Key.Description,
                SaeReceivableConceptClassifier.GetLabel(
                    item.Key.Kind
                ),
                item.Value.Amount,
                item.Value.Count
            ))
            .OrderByDescending(item => item.Amount)
            .ToArray();

        return new ClassifiedReductions(
            realIncomeAmount,
            realPaymentCount,
            returnsAndCreditsAmount,
            returnAndCreditCount,
            appliedAdvanceAmount,
            appliedAdvanceCount,
            otherReductionAmount,
            otherReductionCount,
            totals
                .Where(item =>
                    item.Classification == "Ingreso real")
                .ToArray(),
            totals
                .Where(item =>
                    item.Classification != "Ingreso real")
                .ToArray(),
            realIncomeDaily
        );
    }

    private static async Task<SaeReceivablesFilterOptions>
        ReadFilterOptionsAsync(
            FbConnection connection,
            string invoiceTableName,
            string movementsTableName,
            string conceptsTableName,
            string sellersTableName,
            DateTime from,
            DateTime toExclusive,
            CancellationToken cancellationToken
        )
    {
        var sellers = await ReadFilterOptionQueryAsync(
            connection,
            $"""
            SELECT
                V.CVE_VEND,
                COALESCE(V.NOMBRE, V.CVE_VEND),
                COUNT(I.CVE_DOC),
                COALESCE(SUM(ABS(I.IMPORTE)), 0),
                COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0),
                COALESCE(SUM(CASE WHEN COALESCE(I.STATUS, '') <> 'C' AND I.CVE_DOC IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN COALESCE(I.STATUS, '') <> 'C' THEN ABS(I.IMPORTE) ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN COALESCE(I.STATUS, '') <> 'C' THEN ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0)) ELSE 0 END), 0)
            FROM {sellersTableName} V
            LEFT JOIN {invoiceTableName} I
                ON I.CVE_VEND = V.CVE_VEND
               AND I.FECHA_DOC >= @FROM_DATE
               AND I.FECHA_DOC < @TO_DATE
            WHERE COALESCE(V.STATUS, 'A') <> 'B'
            GROUP BY V.CVE_VEND, V.NOMBRE
            ORDER BY V.NOMBRE
            """,
            from,
            toExclusive,
            cancellationToken
        );

        var series = await ReadFilterOptionQueryAsync(
            connection,
            $"""
            SELECT
                COALESCE(I.SERIE, ''),
                COALESCE(I.SERIE, 'Sin serie'),
                COUNT(*),
                COALESCE(SUM(ABS(I.IMPORTE)), 0),
                COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0)
            FROM {invoiceTableName} I
            WHERE I.FECHA_DOC >= @FROM_DATE
              AND I.FECHA_DOC < @TO_DATE
            GROUP BY I.SERIE
            ORDER BY I.SERIE
            """,
            from,
            toExclusive,
            cancellationToken
        );

        var warehouses = await ReadFilterOptionQueryAsync(
            connection,
            $"""
            SELECT
                CAST(I.NUM_ALMA AS VARCHAR(20)),
                'Almacén ' || CAST(I.NUM_ALMA AS VARCHAR(20)),
                COUNT(*),
                COALESCE(SUM(ABS(I.IMPORTE)), 0),
                COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0)
            FROM {invoiceTableName} I
            WHERE I.FECHA_DOC >= @FROM_DATE
              AND I.FECHA_DOC < @TO_DATE
            GROUP BY I.NUM_ALMA
            ORDER BY I.NUM_ALMA
            """,
            from,
            toExclusive,
            cancellationToken
        );

        var statusRows = await ReadFilterOptionQueryAsync(
            connection,
            $"""
            SELECT
                COALESCE(I.STATUS, ''),
                COALESCE(I.STATUS, 'Sin estado'),
                COUNT(*),
                COALESCE(SUM(ABS(I.IMPORTE)), 0),
                COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0)
            FROM {invoiceTableName} I
            WHERE I.FECHA_DOC >= @FROM_DATE
              AND I.FECHA_DOC < @TO_DATE
            GROUP BY I.STATUS
            ORDER BY I.STATUS
            """,
            from,
            toExclusive,
            cancellationToken
        );

        var rawStatuses = statusRows
            .GroupBy(option =>
                option.Value == "C"
                    ? "Canceled"
                    : "Active")
            .Select(group => new SaeReceivableFilterOption(
                group.Key,
                group.Key == "Canceled"
                    ? "Canceladas"
                    : "Vigentes",
                group.Sum(option => option.RecordCount),
                group.Sum(option => option.Amount),
                group.Sum(option => option.AmountWithoutTax)
            ))
            .OrderBy(option => option.Label)
            .ToArray();

        var fiscalPaymentMethods =
            await ReadFilterOptionQueryAsync(
                connection,
                $"""
                SELECT
                    COALESCE(I.METODODEPAGO, ''),
                    COALESCE(I.METODODEPAGO, 'Sin método fiscal'),
                    COUNT(*),
                    COALESCE(SUM(ABS(I.IMPORTE)), 0),
                    COALESCE(SUM(ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))), 0)
                FROM {invoiceTableName} I
                WHERE I.FECHA_DOC >= @FROM_DATE
                  AND I.FECHA_DOC < @TO_DATE
                GROUP BY I.METODODEPAGO
                ORDER BY I.METODODEPAGO
                """,
                from,
                toExclusive,
                cancellationToken
            );

        var paymentConceptCandidates =
            await ReadFilterOptionQueryAsync(
                connection,
                $"""
                SELECT
                    CAST(D.NUM_CPTO AS VARCHAR(20)),
                    COALESCE(C.DESCR, 'Concepto sin descripción'),
                    COUNT(*),
                    COALESCE(SUM(ABS(D.IMPORTE)), 0)
                FROM {movementsTableName} D
                LEFT JOIN {conceptsTableName} C
                    ON C.NUM_CPTO = D.NUM_CPTO
                WHERE D.FECHA_APLI >= @FROM_DATE
                  AND D.FECHA_APLI < @TO_DATE
                  AND (
                        CASE
                            WHEN D.SIGNO IS NULL OR D.SIGNO = 0
                            THEN C.SIGNO
                            ELSE D.SIGNO
                        END
                      ) < 0
                GROUP BY D.NUM_CPTO, C.DESCR
                ORDER BY C.DESCR
                """,
                from,
                toExclusive,
                cancellationToken
            );

        var paymentConcepts = paymentConceptCandidates
            .Where(option =>
                int.TryParse(option.Value, out var conceptNumber) &&
                SaeReceivableConceptClassifier.Classify(
                    conceptNumber,
                    option.Label
                ) == SaeReceivableReductionKind.RealPayment
            )
            .ToArray();

        return new SaeReceivablesFilterOptions(
            sellers,
            series,
            warehouses,
            rawStatuses,
            fiscalPaymentMethods,
            paymentConcepts
        );
    }

    private static async Task<
        IReadOnlyList<SaeReceivableFilterOption>
    > ReadFilterOptionQueryAsync(
        FbConnection connection,
        string sql,
        DateTime from,
        DateTime toExclusive,
        CancellationToken cancellationToken
    )
    {
        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        var options =
            new List<SaeReceivableFilterOption>();

        while (await reader.ReadAsync(cancellationToken))
        {
            options.Add(
                new SaeReceivableFilterOption(
                    GetString(reader, 0) ?? string.Empty,
                    GetString(reader, 1) ?? "Sin descripción",
                    GetInt32(reader, 2),
                    GetDecimal(reader, 3),
                    reader.FieldCount > 4
                        ? GetDecimal(reader, 4)
                        : GetDecimal(reader, 3),
                    reader.FieldCount > 5
                        ? GetInt32(reader, 5)
                        : 0,
                    reader.FieldCount > 6
                        ? GetDecimal(reader, 6)
                        : 0,
                    reader.FieldCount > 7
                        ? GetDecimal(reader, 7)
                        : 0
                )
            );
        }

        return options;
    }

    private static async Task<IReadOnlyList<SaeReceivableRecentMovement>>
        ReadRecentPaymentsAsync(
            FbConnection connection,
            string movementsTableName,
            string conceptsTableName,
            string invoiceTableName,
            DateTime from,
            DateTime toExclusive,
            SaeReceivablesSummaryFilter filters,
            CancellationToken cancellationToken
        )
    {
        var filterClause =
            BuildReductionFilterClause(filters);
        var sql = $"""
            SELECT FIRST {RecentReductionCandidates}
                D.CVE_CLIE,
                D.NO_FACTURA,
                D.DOCTO,
                D.NUM_CPTO,
                COALESCE(C.DESCR, 'Concepto sin descripción'),
                ABS(D.IMPORTE),
                D.FECHA_APLI
            FROM {movementsTableName} D
            LEFT JOIN {conceptsTableName} C
                ON C.NUM_CPTO = D.NUM_CPTO
            LEFT JOIN {invoiceTableName} I
                ON I.CVE_DOC = D.NO_FACTURA
            WHERE D.FECHA_APLI >= @FROM_DATE
              AND D.FECHA_APLI < @TO_DATE
              AND (
                    CASE
                        WHEN D.SIGNO IS NULL OR D.SIGNO = 0
                        THEN C.SIGNO
                        ELSE D.SIGNO
                    END
                  ) < 0
              AND {filterClause}
            ORDER BY
                D.FECHA_APLI DESC,
                D.ID_MOV DESC,
                D.NO_PARTIDA DESC
            """;

        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );
        AddFilterParameters(
            command,
            filters,
            includePaymentConcept: true
        );

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        var values =
            new List<SaeReceivableRecentMovement>();

        while (await reader.ReadAsync(cancellationToken))
        {
            var conceptNumber = GetInt32(reader, 3);
            var description =
                GetString(reader, 4) ??
                "Concepto sin descripción";

            if (SaeReceivableConceptClassifier.Classify(
                    conceptNumber,
                    description
                ) != SaeReceivableReductionKind.RealPayment)
            {
                continue;
            }

            values.Add(
                new SaeReceivableRecentMovement(
                    GetString(reader, 0) ?? string.Empty,
                    GetString(reader, 1),
                    GetString(reader, 2),
                    conceptNumber,
                    description,
                    GetDecimal(reader, 5),
                    reader.GetDateTime(6)
                )
            );

            if (values.Count == MaximumRecentRecords)
            {
                break;
            }
        }

        return values;
    }

    private static async Task<
        IReadOnlyList<SaeReceivableRecentCancellation>
    > ReadRecentCancellationsAsync(
        FbConnection connection,
        string tableName,
        DateTime from,
        DateTime toExclusive,
        SaeReceivablesSummaryFilter filters,
        CancellationToken cancellationToken
    )
    {
        var filterClause =
            BuildInvoiceFilterClause(filters, "I");
        var sql = $"""
            SELECT FIRST {MaximumRecentRecords}
                I.CVE_DOC,
                I.CVE_CLPV,
                ABS(I.IMPORTE),
                I.FECHA_DOC,
                I.FECHA_CANCELA
            FROM {tableName} I
            WHERE I.STATUS = 'C'
              AND I.FECHA_CANCELA >= @FROM_DATE
              AND I.FECHA_CANCELA < @TO_DATE
              AND {filterClause}
            ORDER BY
                I.FECHA_CANCELA DESC,
                I.CVE_DOC DESC
            """;

        await using var command = CreatePeriodCommand(
            sql,
            connection,
            from,
            toExclusive
        );
        AddFilterParameters(command, filters);

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        var values =
            new List<SaeReceivableRecentCancellation>();

        while (await reader.ReadAsync(cancellationToken))
        {
            values.Add(
                new SaeReceivableRecentCancellation(
                    GetString(reader, 0) ?? string.Empty,
                    GetString(reader, 1) ?? string.Empty,
                    GetDecimal(reader, 2),
                    reader.GetDateTime(3),
                    reader.GetDateTime(4)
                )
            );
        }

        return values;
    }

    private static async Task<int> ReadFutureReductionCountAsync(
        FbConnection connection,
        string movementsTableName,
        string conceptsTableName,
        string invoiceTableName,
        SaeReceivablesSummaryFilter filters,
        CancellationToken cancellationToken
    )
    {
        var filterClause =
            BuildReductionFilterClause(filters);
        var sql = $"""
            SELECT COUNT(*)
            FROM {movementsTableName} D
            LEFT JOIN {conceptsTableName} C
                ON C.NUM_CPTO = D.NUM_CPTO
            LEFT JOIN {invoiceTableName} I
                ON I.CVE_DOC = D.NO_FACTURA
            WHERE D.FECHA_APLI > CURRENT_DATE
              AND (
                    CASE
                        WHEN D.SIGNO IS NULL OR D.SIGNO = 0
                        THEN C.SIGNO
                        ELSE D.SIGNO
                    END
                  ) < 0
              AND {filterClause}
            """;

        await using var command =
            new FbCommand(sql, connection)
            {
                CommandTimeout = 20
            };
        AddFilterParameters(
            command,
            filters,
            includePaymentConcept: true
        );

        var value =
            await command.ExecuteScalarAsync(cancellationToken);

        return value is null or DBNull
            ? 0
            : Convert.ToInt32(value);
    }

    private static IReadOnlyList<SaeReceivablesDailyPoint>
        BuildDailySeries(
            DateOnly periodStart,
            DateOnly periodEnd,
            IReadOnlyDictionary<DateOnly, decimal> invoiceDaily,
            IReadOnlyDictionary<DateOnly, decimal> realIncomeDaily,
            IReadOnlyDictionary<DateOnly, decimal> invoiceDailyWithoutTax
        )
    {
        var values = new List<SaeReceivablesDailyPoint>();

        for (
            var date = periodStart;
            date <= periodEnd;
            date = date.AddDays(1)
        )
        {
            invoiceDaily.TryGetValue(
                date,
                out var netInvoicedAmount
            );
            realIncomeDaily.TryGetValue(
                date,
                out var realIncomeAmount
            );
            invoiceDailyWithoutTax.TryGetValue(
                date,
                out var netInvoicedAmountWithoutTax
            );

            values.Add(
                new SaeReceivablesDailyPoint(
                    date,
                    netInvoicedAmount,
                    realIncomeAmount,
                    netInvoicedAmountWithoutTax
                )
            );
        }

        return values;
    }

    private static string BuildReductionFilterClause(
        SaeReceivablesSummaryFilter filters
    )
    {
        var clauses = new List<string>();

        if (filters.HasInvoiceFilters)
        {
            clauses.Add(
                BuildInvoiceFilterClause(filters, "I")
            );
        }

        if (filters.PaymentConceptNumber.HasValue)
        {
            clauses.Add(
                "D.NUM_CPTO = @PAYMENT_CONCEPT"
            );
        }

        return clauses.Count == 0
            ? "1 = 1"
            : string.Join(" AND ", clauses);
    }

    private static string BuildInvoiceFilterClause(
        SaeReceivablesSummaryFilter filters,
        string alias
    )
    {
        var clauses = new List<string>();

        if (!string.IsNullOrWhiteSpace(filters.SellerCode))
        {
            clauses.Add(
                $"UPPER(TRIM({alias}.CVE_VEND)) = " +
                "UPPER(TRIM(@SELLER_CODE))"
            );
        }

        if (!string.IsNullOrWhiteSpace(filters.Series))
        {
            clauses.Add(
                $"{alias}.SERIE = @SERIES"
            );
        }

        if (filters.FolioFrom.HasValue)
        {
            clauses.Add(
                $"{alias}.FOLIO >= @FOLIO_FROM"
            );
        }

        if (filters.FolioTo.HasValue)
        {
            clauses.Add(
                $"{alias}.FOLIO <= @FOLIO_TO"
            );
        }

        if (!string.IsNullOrWhiteSpace(filters.CustomerCode))
        {
            clauses.Add(
                $"UPPER(TRIM({alias}.CVE_CLPV)) = " +
                "UPPER(TRIM(@CUSTOMER_CODE))"
            );
        }

        if (filters.WarehouseNumber.HasValue)
        {
            clauses.Add(
                $"{alias}.NUM_ALMA = @WAREHOUSE"
            );
        }

        if (filters.InvoiceStatus == "Canceled")
        {
            clauses.Add($"{alias}.STATUS = 'C'");
        }
        else if (filters.InvoiceStatus == "Active")
        {
            clauses.Add(
                $"COALESCE({alias}.STATUS, '') <> 'C'"
            );
        }

        if (!string.IsNullOrWhiteSpace(
                filters.FiscalPaymentMethod
            ))
        {
            clauses.Add(
                $"{alias}.METODODEPAGO = @FISCAL_METHOD"
            );
        }

        return clauses.Count == 0
            ? "1 = 1"
            : string.Join(" AND ", clauses);
    }

    private static void AddFilterParameters(
        FbCommand command,
        SaeReceivablesSummaryFilter filters,
        bool includePaymentConcept = false
    )
    {
        if (!string.IsNullOrWhiteSpace(filters.SellerCode))
        {
            command.Parameters.AddWithValue(
                "@SELLER_CODE",
                filters.SellerCode
            );
        }

        if (!string.IsNullOrWhiteSpace(filters.Series))
        {
            command.Parameters.AddWithValue(
                "@SERIES",
                filters.Series
            );
        }

        if (filters.FolioFrom.HasValue)
        {
            command.Parameters.AddWithValue(
                "@FOLIO_FROM",
                filters.FolioFrom.Value
            );
        }

        if (filters.FolioTo.HasValue)
        {
            command.Parameters.AddWithValue(
                "@FOLIO_TO",
                filters.FolioTo.Value
            );
        }

        if (!string.IsNullOrWhiteSpace(filters.CustomerCode))
        {
            command.Parameters.AddWithValue(
                "@CUSTOMER_CODE",
                filters.CustomerCode
            );
        }

        if (filters.WarehouseNumber.HasValue)
        {
            command.Parameters.AddWithValue(
                "@WAREHOUSE",
                filters.WarehouseNumber.Value
            );
        }

        if (!string.IsNullOrWhiteSpace(
                filters.FiscalPaymentMethod
            ))
        {
            command.Parameters.AddWithValue(
                "@FISCAL_METHOD",
                filters.FiscalPaymentMethod
            );
        }

        if (includePaymentConcept &&
            filters.PaymentConceptNumber.HasValue)
        {
            command.Parameters.AddWithValue(
                "@PAYMENT_CONCEPT",
                filters.PaymentConceptNumber.Value
            );
        }
    }

    private static FbCommand CreatePeriodCommand(
        string sql,
        FbConnection connection,
        DateTime from,
        DateTime toExclusive
    )
    {
        var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 25
        };

        command.Parameters.AddWithValue(
            "@FROM_DATE",
            from
        );
        command.Parameters.AddWithValue(
            "@TO_DATE",
            toExclusive
        );

        return command;
    }

    private static SaeReceivablesSummaryFilter NormalizeFilters(
        SaeReceivablesSummaryFilter filters
    )
    {
        var normalizedStatus = filters.InvoiceStatus?.Trim();

        if (normalizedStatus is not null and
            not "Active" and
            not "Canceled")
        {
            throw new ArgumentException(
                "El estado de factura solicitado no es válido."
            );
        }

        if (filters.FolioFrom is < 0 ||
            filters.FolioTo is < 0 ||
            filters.FolioFrom.HasValue &&
            filters.FolioTo.HasValue &&
            filters.FolioTo < filters.FolioFrom)
        {
            throw new ArgumentException(
                "El rango de folios no es válido."
            );
        }

        if (filters.WarehouseNumber is <= 0)
        {
            throw new ArgumentException(
                "El almacén solicitado no es válido."
            );
        }

        if (filters.PaymentConceptNumber is <= 0)
        {
            throw new ArgumentException(
                "El concepto de pago solicitado no es válido."
            );
        }

        return filters with
        {
            SellerCode =
                NormalizeOptional(filters.SellerCode),
            Series =
                NormalizeOptional(filters.Series),
            CustomerCode =
                NormalizeOptional(filters.CustomerCode),
            InvoiceStatus = normalizedStatus,
            FiscalPaymentMethod =
                NormalizeOptional(filters.FiscalPaymentMethod)
        };
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim();
    }

    private static void ValidatePeriod(
        DateOnly periodStart,
        DateOnly periodEnd
    )
    {
        if (periodEnd < periodStart)
        {
            throw new ArgumentException(
                "La fecha final debe ser igual o posterior a la inicial."
            );
        }

        if (periodEnd.DayNumber - periodStart.DayNumber > 366)
        {
            throw new ArgumentException(
                "El resumen admite periodos de hasta 367 días."
            );
        }
    }

    private static int GetInt32(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? 0
            : Convert.ToInt32(reader.GetValue(ordinal));
    }

    private static decimal GetDecimal(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? 0
            : Convert.ToDecimal(reader.GetValue(ordinal));
    }

    private static string? GetString(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : reader.GetString(ordinal).Trim();
    }

    private static SaeReceivablesSummaryResult CreateFailure(
        DateOnly periodStart,
        DateOnly periodEnd,
        SaeReceivablesSummaryFilter filters,
        string invoiceTableName,
        string movementsTableName,
        string conceptsTableName,
        string message,
        long elapsedMilliseconds
    )
    {
        return new SaeReceivablesSummaryResult(
            false,
            message,
            periodStart,
            periodEnd,
            filters,
            new SaeReceivablesFilterOptions(
                Array.Empty<SaeReceivableFilterOption>(),
                Array.Empty<SaeReceivableFilterOption>(),
                Array.Empty<SaeReceivableFilterOption>(),
                Array.Empty<SaeReceivableFilterOption>(),
                Array.Empty<SaeReceivableFilterOption>(),
                Array.Empty<SaeReceivableFilterOption>()
            ),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            Array.Empty<SaeReceivableConceptTotal>(),
            Array.Empty<SaeReceivableConceptTotal>(),
            Array.Empty<SaeReceivablesDailyPoint>(),
            Array.Empty<SaeReceivableRecentMovement>(),
            Array.Empty<SaeReceivableRecentCancellation>(),
            0,
            0,
            0,
            0,
            0,
            invoiceTableName,
            movementsTableName,
            conceptsTableName,
            elapsedMilliseconds
        );
    }

    private sealed record InvoiceSummary(
        int InvoiceCount,
        decimal GrossAmount,
        decimal NetAmount,
        int NetInvoiceCount,
        decimal VoidedAmount,
        int VoidedCount,
        decimal GrossAmountWithoutTax,
        decimal NetAmountWithoutTax,
        decimal VoidedAmountWithoutTax
    );

    private readonly record struct CancellationSummary(
        decimal Amount,
        int Count,
        decimal AmountWithoutTax
    );

    private readonly record struct AmountAndCount(
        decimal Amount,
        int Count
    );

    private sealed record ReductionAggregate(
        DateOnly Date,
        int ConceptNumber,
        string Description,
        decimal Amount,
        int Count
    );

    private sealed record ClassifiedReductions(
        decimal RealIncomeAmount,
        int RealPaymentCount,
        decimal ReturnsAndCreditsAmount,
        int ReturnAndCreditCount,
        decimal AppliedAdvanceAmount,
        int AppliedAdvanceCount,
        decimal OtherReductionAmount,
        int OtherReductionCount,
        IReadOnlyList<SaeReceivableConceptTotal> IncomeBreakdown,
        IReadOnlyList<SaeReceivableConceptTotal> NonCashBreakdown,
        IReadOnlyDictionary<DateOnly, decimal> RealIncomeDaily
    );
}
