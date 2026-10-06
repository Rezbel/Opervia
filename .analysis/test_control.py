from pathlib import Path
p=Path('tests/Opervia.Application.Tests/Flows/SaeSalesFlowBuilderTests.cs')
s=p.read_text(encoding='utf-8-sig');at=s.index('    private static SaeDocumentHeader CreateDocument(')
s=s[:at]+'''    [Fact]
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

'''+s[at:];p.write_text(s,encoding='utf-8')
# Keep document details accessible on shorter screens.
p=Path('src/Opervia.Web/src/features/processes/DocumentItemsPanel.css');s=p.read_text(encoding='utf-8-sig').replace('  overflow: hidden;','  overflow-y: auto;',1);s+='\n.document-context, .document-items-header, .document-items-summary { flex-shrink: 0; }\n';p.write_text(s,encoding='utf-8')
