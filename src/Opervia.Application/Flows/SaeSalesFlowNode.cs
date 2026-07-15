namespace Opervia.Application.Flows;

public sealed record SaeSalesFlowNode(
    string Id,
    int Sequence,
    string Kind,
    string? DocumentType,
    string DocumentNumber,
    string CustomerCode,
    string? Status,
    DateTime? DocumentDate,
    decimal? Amount,
    string? PreviousDocumentNumber,
    string? NextDocumentNumber
);
