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
