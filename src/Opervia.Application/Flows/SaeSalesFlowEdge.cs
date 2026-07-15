namespace Opervia.Application.Flows;

public sealed record SaeSalesFlowEdge(
    string Id,
    string Source,
    string Target,
    string Relation
);
