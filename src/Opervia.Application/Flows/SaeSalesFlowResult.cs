namespace Opervia.Application.Flows;

public sealed record SaeSalesFlowResult(
    bool IsSuccessful,
    string Message,
    string StartingDocumentNumber,
    IReadOnlyList<SaeSalesFlowNode> Nodes,
    IReadOnlyList<SaeSalesFlowEdge> Edges,
    IReadOnlyList<string> Warnings,
    long ElapsedMilliseconds
);
