namespace Opervia.Application.Receivables;

public sealed record SaeReceivableRoot(
    string CustomerCode,
    string? Reference,
    int ConceptNumber,
    int ChargeNumber,
    int? ObservationKey,
    string? InvoiceNumber,
    string? Document,
    decimal? Amount,
    DateTime? ApplicationDate,
    DateTime? DueDate,
    int? FolioKey,
    int? LogKey,
    string? SystemReference,
    string? Uuid,
    string? Status,
    int? Sign,
    decimal? InvoiceAmountBeforeTax
);
