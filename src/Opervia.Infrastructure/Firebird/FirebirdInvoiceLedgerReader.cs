using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

internal sealed record InvoiceLedgerEntry(string Invoice, string Customer, string Reference, int Charge, int Concept,
    string Description, string Document, decimal SignedAmount, DateTime? Date, DateTime? Due, string Key, bool IsOriginal, string? Uuid);

internal static class FirebirdInvoiceLedgerReader
{
    public static async Task<IReadOnlyList<InvoiceLedgerEntry>> ReadAsync(FbConnection connection, FbTransaction transaction,
        SaeConnectionProfile profile, IReadOnlyList<(string Invoice, string Customer)> documents, CancellationToken token)
    {
        var entries = new List<InvoiceLedgerEntry>();
        if (documents.Count == 0) return entries;
        var clauses = documents.Select((_, i) => $"(M.NO_FACTURA = @DOC{i} AND M.CVE_CLIE = @CLIENT{i})");
        var sql = $"""
            SELECT M.NO_FACTURA, M.CVE_CLIE, M.REFER, M.NUM_CARGO, M.NUM_CPTO, C.DESCR, M.DOCTO,
                COALESCE(M.IMPORTE, 0) * COALESCE(M.SIGNO, 0), M.FECHA_APLI, M.FECHA_VENC, M.UUID
            FROM {profile.ResolveTableName("CUEN_M")} M
            LEFT JOIN {profile.ResolveTableName("CONC")} C ON C.NUM_CPTO = M.NUM_CPTO
            WHERE {string.Join(" OR ", clauses)}
            """;
        await using (var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 30 })
        {
            for (var i = 0; i < documents.Count; i++) {
                command.Parameters.AddWithValue($"@DOC{i}", documents[i].Invoice);
                command.Parameters.AddWithValue($"@CLIENT{i}", documents[i].Customer);
            }
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) entries.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2),
                Integer(reader, 3), Integer(reader, 4), Text(reader, 5), Text(reader, 6), Number(reader, 7), Date(reader, 8), Date(reader, 9),
                $"charge:{entries.Count}", true, Text(reader, 10)));
        }
        var keys = entries.Select(row => (row.Customer, row.Reference, row.Charge)).Distinct().ToArray();
        if (keys.Length == 0) return entries;
        var invoiceKeys = entries.ToLookup(row => (row.Customer.Trim(), row.Reference.Trim(), row.Charge));
        var applicationClauses = keys.Select((_, i) => $"(D.CVE_CLIE = @CLIENT{i} AND D.REFER = @REFER{i} AND D.NUM_CARGO = @CHARGE{i})");
        var applicationsSql = $"""
            SELECT D.CVE_CLIE, D.REFER, D.NUM_CARGO, D.NUM_CPTO, C.DESCR, D.DOCTO,
                COALESCE(D.IMPORTE, 0) * COALESCE(D.SIGNO, 0), D.FECHA_APLI, D.FECHA_VENC, D.ID_MOV, D.NO_PARTIDA
            FROM {profile.ResolveTableName("CUEN_DET")} D
            LEFT JOIN {profile.ResolveTableName("CONC")} C ON C.NUM_CPTO = D.NUM_CPTO
            WHERE {string.Join(" OR ", applicationClauses)}
            """;
        await using (var command = new FbCommand(applicationsSql, connection, transaction) { CommandTimeout = 30 })
        {
            for (var i = 0; i < keys.Length; i++) {
                command.Parameters.AddWithValue($"@CLIENT{i}", keys[i].Customer);
                command.Parameters.AddWithValue($"@REFER{i}", keys[i].Reference);
                command.Parameters.AddWithValue($"@CHARGE{i}", keys[i].Charge);
            }
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) {
                var key = (Text(reader, 0), Text(reader, 1), Integer(reader, 2));
                var root = invoiceKeys[key].First();
                entries.Add(new(root.Invoice, root.Customer, root.Reference, key.Item3, Integer(reader, 3), Text(reader, 4),
                    Text(reader, 5), Number(reader, 6), Date(reader, 7), Date(reader, 8), $"application:{Integer(reader, 9)}:{Integer(reader, 10)}", false, null));
            }
        }
        return entries;
    }

    public static ReceivableInvoiceAccountSummary Calculate(IEnumerable<InvoiceLedgerEntry> entries, bool cancelled)
    {
        var all = entries.ToArray();
        return ReceivableInvoiceAccounting.Calculate(
            all.Where(row => row.IsOriginal).Select(row => new ReceivableInvoiceCharge(row.Reference.Trim(), row.Charge, row.SignedAmount, row.Due)).ToArray(),
            all.Where(row => !row.IsOriginal).Select(row => new ReceivableInvoiceApplication(row.Reference.Trim(), row.Charge, row.SignedAmount)).ToArray(),
            cancelled, DateOnly.FromDateTime(DateTime.Today));
    }
    private static string Text(FbDataReader reader, int i) => reader.IsDBNull(i) ? "" : reader.GetString(i).Trim();
    private static int Integer(FbDataReader reader, int i) => reader.IsDBNull(i) ? 0 : Convert.ToInt32(reader.GetValue(i));
    private static decimal Number(FbDataReader reader, int i) => reader.IsDBNull(i) ? 0 : Convert.ToDecimal(reader.GetValue(i));
    private static DateTime? Date(FbDataReader reader, int i) => reader.IsDBNull(i) ? null : reader.GetDateTime(i);
}
