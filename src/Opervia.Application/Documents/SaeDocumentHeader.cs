namespace Opervia.Application.Documents;

public sealed record SaeDocumentHeader(
    string? DocumentType,
    string DocumentNumber,
    string CustomerCode,
    string? Status,
    DateTime? DocumentDate,
    DateTime? CancellationDate,
    string? SalespersonCode,
    int? WarehouseNumber,
    decimal? QuantityTotal,
    decimal? Amount,
    decimal? AmountBeforeTax,
    decimal? TaxAmount,
    string? LinkedStatus,
    string? PreviousDocumentType,
    string? PreviousDocumentNumber,
    string? NextDocumentType,
    string? NextDocumentNumber
);
