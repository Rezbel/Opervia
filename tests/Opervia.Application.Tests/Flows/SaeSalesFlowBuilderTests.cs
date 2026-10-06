using Opervia.Application.Customers;
using Opervia.Application.Documents;
using Opervia.Application.Flows;
using Opervia.Domain.Connections;

namespace Opervia.Application.Tests.Flows;

public sealed class SaeSalesFlowBuilderTests
{
    [Fact]
    public async Task BuildAsync_ReconstructsPreviousDocumentsInOrder()
    {
        var documents = new Dictionary<string, SaeDocumentHeader>(
            StringComparer.OrdinalIgnoreCase
        )
        {
            ["Invoice:F-100"] = CreateDocument(
                "F",
                "F-100",
                previousType: "R",
                previousNumber: "R-100"
            ),
            ["Delivery:R-100"] = CreateDocument(
                "R",
                "R-100",
                nextType: "F",
                nextNumber: "F-100"
            )
        };

        var builder = new SaeSalesFlowBuilder(
            new FakeDocumentLookup(documents),
            new FakeCustomerLookup()
        );

        var result = await builder.BuildAsync(
            CreateProfile(),
            "not-used-by-the-fake",
            SaeDocumentKind.Invoice,
            "F-100"
        );

        Assert.True(result.IsSuccessful);
        Assert.Equal(
            ["R-100", "F-100"],
            result.Nodes.Select(node => node.DocumentNumber)
        );
        Assert.Single(result.Edges);
        Assert.Empty(result.Warnings);
        Assert.All(
            result.Nodes,
            node => Assert.Equal("Cliente de prueba", node.CustomerName)
        );
    }

    [Fact]
    public async Task BuildAsync_ReportsCycleWithoutLoopingForever()
    {
        var documents = new Dictionary<string, SaeDocumentHeader>(
            StringComparer.OrdinalIgnoreCase
        )
        {
            ["Invoice:F-200"] = CreateDocument(
                "F",
                "F-200",
                previousType: "F",
                previousNumber: "F-200"
            )
        };

        var builder = new SaeSalesFlowBuilder(
            new FakeDocumentLookup(documents),
            new FakeCustomerLookup()
        );

        var result = await builder.BuildAsync(
            CreateProfile(),
            "not-used-by-the-fake",
            SaeDocumentKind.Invoice,
            "F-200"
        );

        Assert.True(result.IsSuccessful);
        Assert.Single(result.Nodes);
        Assert.Contains(
            result.Warnings,
            warning => warning.Contains(
                "ciclo",
                StringComparison.OrdinalIgnoreCase
            )
        );
    }

    [Fact]
    public async Task BuildAsync_ReturnsFailureWhenStartingDocumentIsMissing()
    {
        var builder = new SaeSalesFlowBuilder(
            new FakeDocumentLookup(
                new Dictionary<string, SaeDocumentHeader>()
            ),
            new FakeCustomerLookup()
        );

        var result = await builder.BuildAsync(
            CreateProfile(),
            "not-used-by-the-fake",
            SaeDocumentKind.Order,
            "P-404"
        );

        Assert.False(result.IsSuccessful);
        Assert.Empty(result.Nodes);
        Assert.Empty(result.Edges);
    }

    [Fact]
    public async Task Graph_IncludesBranches_DeduplicatesLinks_AndKeepsCustomerAndWarehouse()
    {
        var docs = new Dictionary<string, SaeDocumentHeader> {
            ["Order:P-1"] = CreateDocument("P", "P-1"),
            ["Delivery:R-1"] = CreateDocument("R", "R-1"),
            ["Invoice:F-1"] = CreateDocument("F", "F-1"),
            ["Invoice:F-2"] = CreateDocument("F", "F-2")
        };
        SaeDocumentLink[] relations = [new(SaeDocumentKind.Order,"P-1",SaeDocumentKind.Delivery,"R-1"),
            new(SaeDocumentKind.Delivery,"R-1",SaeDocumentKind.Invoice,"F-1"),
            new(SaeDocumentKind.Delivery,"R-1",SaeDocumentKind.Invoice,"F-2"),
            new(SaeDocumentKind.Delivery,"R-1",SaeDocumentKind.Invoice,"F-2")];
        var builder = new SaeSalesGraphBuilder(new FakeDocumentLookup(docs),new FakeCustomerLookup(),new FakeLinks(relations));
        var result = await builder.BuildAsync(CreateProfile(),"fake",SaeDocumentKind.Order,"P-1");
        Assert.True(result.IsSuccessful);
        Assert.Equal(4,result.Nodes.Count);
        Assert.Equal(3,result.Edges.Count);
        Assert.Equal(2,result.Nodes.Count(n=>n.Kind=="Invoice"));
        Assert.All(result.Nodes,n=> { Assert.Equal(1,n.WarehouseNumber); Assert.Equal("Cliente de prueba",n.CustomerName); });
        var reverse = await builder.BuildAsync(CreateProfile(),"fake",SaeDocumentKind.Invoice,"F-2");
        Assert.Equal(4,reverse.Nodes.Count);
        Assert.Equal(3,reverse.Edges.Count);
    }

    [Fact]
    public async Task Graph_MissingRelatedDocument_IsReportedWithoutDanglingEdge()
    {
        var docs = new Dictionary<string,SaeDocumentHeader> { ["Order:P-1"] = CreateDocument("P","P-1") };
        var builder = new SaeSalesGraphBuilder(new FakeDocumentLookup(docs),new FakeCustomerLookup(),
            new FakeLinks([new(SaeDocumentKind.Order,"P-1",SaeDocumentKind.Invoice,"F-missing")]));
        var result = await builder.BuildAsync(CreateProfile(),"fake",SaeDocumentKind.Order,"P-1");
        Assert.Single(result.Nodes); Assert.Empty(result.Edges); Assert.NotEmpty(result.Warnings);
    }

    private sealed class FakeLinks(SaeDocumentLink[] links) : ISaeDocumentLinksReader
    {
        public Task<IReadOnlyList<SaeDocumentLink>> ReadAsync(SaeConnectionProfile profile,string password,
            SaeDocumentKind kind,string number,CancellationToken cancellationToken=default) =>
            Task.FromResult<IReadOnlyList<SaeDocumentLink>>(links.Where(l=>
                (l.SourceKind==kind && l.SourceNumber==number)||(l.TargetKind==kind && l.TargetNumber==number)).ToArray());
    }

    private static SaeDocumentHeader CreateDocument(
        string type,
        string number,
        string? previousType = null,
        string? previousNumber = null,
        string? nextType = null,
        string? nextNumber = null
    )
    {
        return new SaeDocumentHeader(
            type,
            number,
            "CLIE01",
            "E",
            new DateTime(2026, 1, 1),
            null,
            null,
            1,
            1,
            100,
            86.21m,
            13.79m,
            null,
            previousType,
            previousNumber,
            nextType,
            nextNumber
        );
    }

    private static SaeConnectionProfile CreateProfile()
    {
        return new SaeConnectionProfile
        {
            DisplayName = "Prueba",
            Host = "not-used.test",
            Database = "NOT-USED.FDB",
            Username = "reader",
            CompanyNumber = "1"
        };
    }

    private sealed class FakeDocumentLookup(
        IReadOnlyDictionary<string, SaeDocumentHeader> documents
    ) : ISaeDocumentLookup
    {
        public Task<SaeDocumentLookupResult> FindAsync(
            SaeConnectionProfile profile,
            string password,
            SaeDocumentKind documentKind,
            string documentNumber,
            CancellationToken cancellationToken = default
        )
        {
            var key = $"{documentKind}:{documentNumber}";
            var found = documents.TryGetValue(key, out var document);

            return Task.FromResult(
                new SaeDocumentLookupResult(
                    found,
                    found ? "Encontrado" : "No encontrado",
                    "FAKE",
                    document,
                    0
                )
            );
        }
    }

    private sealed class FakeCustomerLookup : ISaeCustomerLookup
    {
        public Task<SaeCustomerLookupResult> FindAsync(
            SaeConnectionProfile profile,
            string password,
            string customerCode,
            CancellationToken cancellationToken = default
        )
        {
            return Task.FromResult(
                new SaeCustomerLookupResult(
                    true,
                    "Encontrado",
                    "FAKE",
                    new SaeCustomer(
                        customerCode,
                        "Cliente de prueba",
                        null,
                        "XAXX010101000",
                        null,
                        null
                    ),
                    0
                )
            );
        }
    }
}
