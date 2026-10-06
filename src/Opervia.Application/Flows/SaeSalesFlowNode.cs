namespace Opervia.Application.Flows;

public sealed record SaeSalesFlowNode(
    string Id,
    int Sequence,
    string Kind,
    string? DocumentType,
    string DocumentNumber,
    string CustomerCode,
    string? CustomerName,
    string? CustomerCommercialName,
    string? CustomerRfc,
    string? Status,
    DateTime? DocumentDate,
    decimal? Amount,
    decimal? AmountBeforeTax,
    decimal? TaxAmount,
    string? PreviousDocumentNumber,
    string? NextDocumentNumber,
    int? WarehouseNumber = null,
    string? SalespersonCode = null
);
