using System.Diagnostics;
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
