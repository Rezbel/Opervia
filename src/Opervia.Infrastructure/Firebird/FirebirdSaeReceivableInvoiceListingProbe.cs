using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeReceivableInvoiceListingProbe(ILogger<FirebirdSaeReceivableInvoiceListingProbe> logger)
    : ISaeReceivableInvoiceListingProbe
{
    public async Task<SaeReceivableInvoiceListingResult> ReadAsync(SaeConnectionProfile profile, string password,
        DateOnly from, DateOnly to, string? search, int page, int pageSize, CancellationToken token = default,
        SaeReceivablesSummaryFilter? filters = null)
    {
        var watch = Stopwatch.StartNew();
        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(new FbTransactionOptions {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            }, token);
            var catalog = new List<CatalogInvoice>();
            filters ??= new SaeReceivablesSummaryFilter();
            var filterClause = FirebirdSaeReceivablesSummaryProbe.BuildInvoiceFilterClause(filters, "F");
            var sql = $"""
                SELECT F.CVE_DOC, F.CVE_CLPV, COALESCE(NULLIF(TRIM(C.NOMBRECOMERCIAL), ''), C.NOMBRE, F.CVE_CLPV),
                    C.NOMBRE, F.CVE_VEND, F.FECHA_VEN, F.STATUS, COALESCE(F.FECHAELAB, F.FECHA_DOC)
                FROM {profile.ResolveTableName("FACTF")} F
                LEFT JOIN {profile.ResolveTableName("CLIE")} C ON C.CLAVE = F.CVE_CLPV
                WHERE COALESCE(F.FECHAELAB, F.FECHA_DOC) >= @FROM_DATE AND COALESCE(F.FECHAELAB, F.FECHA_DOC) < @TO_DATE
                  AND {filterClause}
                ORDER BY COALESCE(F.FECHAELAB, F.FECHA_DOC) DESC, F.CVE_DOC DESC
                """;
            await using (var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 30 })
            {
                command.Parameters.AddWithValue("@FROM_DATE", from.ToDateTime(TimeOnly.MinValue));
                command.Parameters.AddWithValue("@TO_DATE", to.AddDays(1).ToDateTime(TimeOnly.MinValue));
                FirebirdSaeReceivablesSummaryProbe.AddFilterParameters(command, filters);
                await using var reader = await command.ExecuteReaderAsync(token);
                while (await reader.ReadAsync(token)) catalog.Add(new(reader.GetString(0), reader.GetString(1),
                    Text(reader, 2), Text(reader, 3), Text(reader, 4), reader.IsDBNull(5) ? null : reader.GetDateTime(5), Text(reader, 6),
                    reader.IsDBNull(7) ? null : reader.GetDateTime(7)));
            }
            var found = ReceivableInvoiceSearch.Find(catalog.Select(row => new ReceivableInvoiceSearchText(
                row.RawInvoice.Trim(), row.RawCustomer.Trim(), row.Name, row.LegalName)).ToArray(), search);
            page = Math.Min(page, Math.Max(1, (int)Math.Ceiling(found.Count / (double)pageSize)));
            var selected = found.Skip((page - 1) * pageSize).Take(pageSize).Select(index => catalog[index]).ToList();
            var entries = await FirebirdInvoiceLedgerReader.ReadAsync(connection, transaction, profile,
                selected.Select(row => (row.RawInvoice, row.RawCustomer)).ToArray(), token);
            var byInvoice = entries.ToLookup(row => (row.Invoice.Trim(), row.Customer.Trim()));
            var invoices = selected.Select(row => {
                var summary = FirebirdInvoiceLedgerReader.Calculate(byInvoice[(row.RawInvoice.Trim(), row.RawCustomer.Trim())], row.Status == "C");
                return new SaeReceivableInvoiceRow(row.RawInvoice.Trim(), row.RawCustomer.Trim(), row.Name, row.Seller,
                    summary.NextDueDate ?? row.Due, summary.Status, row.Creation);
            }).ToArray();
            return new(true, "Se consultaron las facturas del periodo.", from, to, invoices, page, pageSize, found.Count, watch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception exception) {
            logger.LogError(exception, "Falló la búsqueda de facturas del periodo.");
            return new(false, "No fue posible consultar las facturas del periodo.", from, to, [], page, pageSize, 0, watch.ElapsedMilliseconds);
        }
    }

    private sealed record CatalogInvoice(string RawInvoice, string RawCustomer, string Name, string LegalName, string Seller, DateTime? Due, string Status, DateTime? Creation);
    private static string Text(FbDataReader reader, int index) => reader.IsDBNull(index) ? "" : reader.GetString(index).Trim();
}
