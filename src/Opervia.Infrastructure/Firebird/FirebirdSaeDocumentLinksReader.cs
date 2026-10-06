using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Documents;
using Opervia.Application.Flows;
using Opervia.Domain.Connections;
namespace Opervia.Infrastructure.Firebird;
public sealed class FirebirdSaeDocumentLinksReader : ISaeDocumentLinksReader
{
    public async Task<IReadOnlyList<SaeDocumentLink>> ReadAsync(SaeConnectionProfile profile, string password,
        SaeDocumentKind kind, string number, CancellationToken cancellationToken = default)
    {
        await using var connection = FirebirdConnectionFactory.Create(profile, password);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = connection.BeginTransaction(new FbTransactionOptions {
            TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait });
        await using var command = new FbCommand($"""
            SELECT DISTINCT TIP_DOC, CVE_DOC, ANT_SIG, TIP_DOC_E, CVE_DOC_E
            FROM {profile.ResolveTableName("DOCTOSIGF")}
            WHERE (TIP_DOC=@kind AND TRIM(CVE_DOC)=@number)
               OR (TIP_DOC_E=@kind AND TRIM(CVE_DOC_E)=@number)
            """, connection, transaction) { CommandTimeout = 30 };
        command.Parameters.AddWithValue("@kind", kind switch {
            SaeDocumentKind.Quotation => "C", SaeDocumentKind.Order => "P",
            SaeDocumentKind.Delivery => "R", _ => "F" });
        command.Parameters.AddWithValue("@number", number.Trim());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var links = new HashSet<SaeDocumentLink>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var source = Parse(reader.GetString(0)); var target = Parse(reader.GetString(3));
            if (source is null || target is null) continue;
            var a = reader.GetString(1).Trim(); var b = reader.GetString(4).Trim();
            var direction = reader.GetString(2).Trim();
            if (direction == "S") links.Add(new(source.Value, a, target.Value, b));
            if (direction == "A") links.Add(new(target.Value, b, source.Value, a));
        }
        return links.ToArray();
    }
    private static SaeDocumentKind? Parse(string code) => code.Trim() switch {
        "C" => SaeDocumentKind.Quotation, "P" => SaeDocumentKind.Order,
        "R" => SaeDocumentKind.Delivery, "F" => SaeDocumentKind.Invoice, _ => null };
}
