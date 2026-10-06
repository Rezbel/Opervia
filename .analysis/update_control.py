from pathlib import Path
r=Path.cwd()
def put(p,s): (r/p).write_text(s,encoding='utf-8')
def edit(p,a,b):
 q=r/p;s=q.read_text(encoding='utf-8-sig');assert a in s,p;q.write_text(s.replace(a,b),encoding='utf-8')
put('src/Opervia.Application/Flows/ISaeDocumentLinksReader.cs','''using Opervia.Domain.Connections;
using Opervia.Application.Documents;
namespace Opervia.Application.Flows;
public sealed record SaeDocumentLink(SaeDocumentKind SourceKind, string SourceNumber, SaeDocumentKind TargetKind, string TargetNumber);
public interface ISaeDocumentLinksReader
{
    Task<IReadOnlyList<SaeDocumentLink>> ReadAsync(SaeConnectionProfile profile, string password,
        SaeDocumentKind kind, string number, CancellationToken cancellationToken = default);
}
''')
put('src/Opervia.Infrastructure/Firebird/FirebirdSaeDocumentLinksReader.cs','''using FirebirdSql.Data.FirebirdClient;
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
''')
put('src/Opervia.Application/Flows/SaeSalesGraphBuilder.cs','''using System.Diagnostics;
using Opervia.Application.Customers;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;
namespace Opervia.Application.Flows;
public sealed class SaeSalesGraphBuilder(ISaeDocumentLookup documents, ISaeCustomerLookup customers,
    ISaeDocumentLinksReader links) : ISaeSalesFlowBuilder
{
    private const int MaximumDocuments = 200;
    public async Task<SaeSalesFlowResult> BuildAsync(SaeConnectionProfile profile, string password,
        SaeDocumentKind startingDocumentKind, string startingDocumentNumber, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(startingDocumentNumber);
        var timer = Stopwatch.StartNew();
        var queue = new Queue<(SaeDocumentKind Kind, string Number)>();
        var scheduled = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var nodes = new Dictionary<string, SaeSalesFlowNode>(StringComparer.OrdinalIgnoreCase);
        var edges = new Dictionary<string, SaeSalesFlowEdge>(StringComparer.OrdinalIgnoreCase);
        var customerCache = new Dictionary<string, SaeCustomer?>();
        var warnings = new HashSet<string>();
        static string Id(SaeDocumentKind k, string n) => $"{k.ToString().ToLowerInvariant()}:{n.Trim()}";
        void Enqueue(SaeDocumentKind k, string n) {
            var id = Id(k,n);
            if (scheduled.Contains(id)) return;
            if (scheduled.Count >= MaximumDocuments) { warnings.Add("El flujo supera 200 documentos; se muestra un recorrido parcial. Consulta un documento más específico."); return; }
            scheduled.Add(id); queue.Enqueue((k,n.Trim()));
        }
        Enqueue(startingDocumentKind, startingDocumentNumber);
        while(queue.TryDequeue(out var current)) {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await documents.FindAsync(profile,password,current.Kind,current.Number,cancellationToken);
            if (!result.IsSuccessful || result.Document is null) {
                if (nodes.Count == 0) return new(false,result.Message,startingDocumentNumber,[],[],[],timer.ElapsedMilliseconds);
                warnings.Add(result.Message); continue;
            }
            var d = result.Document;
            if (!customerCache.TryGetValue(d.CustomerCode, out var customer)) {
                var lookup = await customers.FindAsync(profile,password,d.CustomerCode,cancellationToken);
                customer = lookup.Customer; customerCache[d.CustomerCode] = customer;
            }
            var id = Id(current.Kind,current.Number);
            nodes[id] = new(id,(int)current.Kind,current.Kind.ToString(),d.DocumentType,d.DocumentNumber,
                d.CustomerCode,customer?.Name,customer?.CommercialName,customer?.Rfc,d.Status,d.DocumentDate,
                d.Amount,d.AmountBeforeTax,d.TaxAmount,d.PreviousDocumentNumber,d.NextDocumentNumber,d.WarehouseNumber,d.SalespersonCode);
            foreach(var link in await links.ReadAsync(profile,password,current.Kind,current.Number,cancellationToken)) {
                var source = Id(link.SourceKind,link.SourceNumber); var target = Id(link.TargetKind,link.TargetNumber);
                if (source == target) { warnings.Add($"Se omitió una relación del documento consigo mismo: {link.SourceNumber}."); continue; }
                var edgeId = $"{source}>{target}";
                edges[edgeId] = new(edgeId,source,target,"related");
                Enqueue(link.SourceKind,link.SourceNumber); Enqueue(link.TargetKind,link.TargetNumber);
            }
        }
        return new(true,$"Se encontraron {nodes.Count} documentos relacionados.",startingDocumentNumber.Trim(),
            nodes.Values.OrderBy(n=>n.Sequence).ThenBy(n=>n.DocumentNumber).ToArray(),
            edges.Values.Where(e=>nodes.ContainsKey(e.Source)&&nodes.ContainsKey(e.Target)).ToArray(),warnings.ToArray(),timer.ElapsedMilliseconds);
    }
}
''')
edit('src/Opervia.Application/Flows/SaeSalesFlowNode.cs','string? NextDocumentNumber\n','string? NextDocumentNumber,\n    int? WarehouseNumber = null,\n    string? SalespersonCode = null\n')
edit('src/Opervia.Api/Program.cs','    SaeSalesFlowBuilder\n','    SaeSalesGraphBuilder\n')
edit('src/Opervia.Api/Program.cs','builder.Services.AddScoped<\n    ISaeSalesFlowBuilder,','builder.Services.AddScoped<ISaeDocumentLinksReader, FirebirdSaeDocumentLinksReader>();\n\nbuilder.Services.AddScoped<\n    ISaeSalesFlowBuilder,')
# Filter before applying the recent-document cap.
for p in ['src/Opervia.Application/Flows/ISaeSalesFlowSummaryProbe.cs','src/Opervia.Infrastructure/Firebird/FirebirdSaeSalesFlowSummaryProbe.cs']:
 edit(p,'CancellationToken cancellationToken = default','CancellationToken cancellationToken = default,\n        string? documentKind = null')
edit('src/Opervia.Infrastructure/Firebird/FirebirdSaeSalesFlowSummaryProbe.cs','var documents = tables\n','var documents = tables\n                .Where(stage => documentKind == null || stage.Kind == documentKind)\n')
edit('src/Opervia.Api/Controllers/SaeSalesFlowSummaryController.cs','[FromQuery] string? seller,','[FromQuery] string? seller,\n        [FromQuery] string? documentKind,')
edit('src/Opervia.Api/Controllers/SaeSalesFlowSummaryController.cs','            cancellationToken);','            cancellationToken, documentKind);')
