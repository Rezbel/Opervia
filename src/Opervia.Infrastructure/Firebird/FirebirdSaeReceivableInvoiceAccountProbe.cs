using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeReceivableInvoiceAccountProbe(ILogger<FirebirdSaeReceivableInvoiceAccountProbe> logger)
    : ISaeReceivableInvoiceAccountProbe
{
    public async Task<SaeReceivableInvoiceAccountResult> ReadAsync(SaeConnectionProfile profile, string password,
        string invoiceNumber, CancellationToken token = default)
    {
        var watch = Stopwatch.StartNew();
        try {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(new FbTransactionOptions {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            }, token);
            var sql = $"""
                SELECT F.CVE_DOC, F.CVE_CLPV, COALESCE(NULLIF(TRIM(C.NOMBRECOMERCIAL), ''), C.NOMBRE, F.CVE_CLPV),
                    F.CVE_VEND, COALESCE(F.FECHAELAB, F.FECHA_DOC), F.FECHA_DOC, F.IMPORTE, F.IMP_TOT4, F.STATUS
                FROM {profile.ResolveTableName("FACTF")} F
                LEFT JOIN {profile.ResolveTableName("CLIE")} C ON C.CLAVE = F.CVE_CLPV
                WHERE F.CVE_DOC = @DOCUMENT
                """;
            string rawInvoice, rawCustomer, name, seller, status;
            DateTime? creation, documentDate;
            decimal gross, vat;
            await using (var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 20 }) {
                command.Parameters.AddWithValue("@DOCUMENT", invoiceNumber.Trim().ToUpperInvariant());
                await using var reader = await command.ExecuteReaderAsync(token);
                if (!await reader.ReadAsync(token)) return new(false, "No se encontró la factura en SAE.", null, [], watch.ElapsedMilliseconds);
                rawInvoice = reader.GetString(0); rawCustomer = reader.GetString(1); name = Text(reader, 2); seller = Text(reader, 3);
                creation = Date(reader, 4); documentDate = Date(reader, 5); gross = Number(reader, 6); vat = Number(reader, 7); status = Text(reader, 8);
            }
            var entries = await FirebirdInvoiceLedgerReader.ReadAsync(connection, transaction, profile, [(rawInvoice, rawCustomer)], token);
            var summary = FirebirdInvoiceLedgerReader.Calculate(entries, status == "C");
            var invoice = new SaeReceivableInvoiceAccount(rawInvoice.Trim(), rawCustomer.Trim(), name, seller, creation, documentDate,
                gross, gross - vat, vat, summary.Balance, summary.Charges, summary.Reductions, summary.NextDueDate, summary.Status, status,
                entries.Where(row => row.IsOriginal).Select(row => (row.Reference, row.Charge)).Distinct().Count(),
                entries.Select(row => row.Uuid).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)));
            // Keep the original movement in the audit trail, alongside the current balance of its own installment.
            // Charge zero is a valid charge number; applications must match both reference and charge.
            var chargeAccounts = entries.GroupBy(row => (row.Reference.Trim(), row.Charge))
                .ToDictionary(group => group.Key, group => FirebirdInvoiceLedgerReader.Calculate(group, status == "C"));
            var movements = entries.OrderBy(row => row.Date).ThenByDescending(row => row.IsOriginal).ThenBy(row => row.Charge)
                .Select(row => new SaeReceivableInvoiceAccountMovement(row.Key, row.Reference.Trim(), row.Charge, row.Concept,
                    row.Description, row.Document, row.SignedAmount, row.Date, row.Due, row.IsOriginal,
                    row.IsOriginal ? chargeAccounts[(row.Reference.Trim(), row.Charge)].Balance : null,
                    row.IsOriginal ? chargeAccounts[(row.Reference.Trim(), row.Charge)].Status : null)).ToArray();
            return new(true, "Se consultó la cuenta completa de la factura.", invoice, movements, watch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception exception) {
            logger.LogError(exception, "Falló la consulta del expediente de factura.");
            return new(false, "No fue posible consultar el expediente de la factura.", null, [], watch.ElapsedMilliseconds);
        }
    }
    private static string Text(FbDataReader reader, int i) => reader.IsDBNull(i) ? "" : reader.GetString(i).Trim();
    private static decimal Number(FbDataReader reader, int i) => reader.IsDBNull(i) ? 0 : Convert.ToDecimal(reader.GetValue(i));
    private static DateTime? Date(FbDataReader reader, int i) => reader.IsDBNull(i) ? null : reader.GetDateTime(i);
}
