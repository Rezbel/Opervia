namespace Opervia.Application.Receivables;

public sealed record SaeReceivablesSummaryFilter(
    string? SellerCode = null,
    string? Series = null,
    int? FolioFrom = null,
    int? FolioTo = null,
    string? CustomerCode = null,
    int? WarehouseNumber = null,
    string? InvoiceStatus = null,
    string? FiscalPaymentMethod = null,
    int? PaymentConceptNumber = null,
    string? InvoiceSearch = null
)
{
    public bool HasInvoiceFilters =>
        !string.IsNullOrWhiteSpace(SellerCode) ||
        !string.IsNullOrWhiteSpace(Series) ||
        FolioFrom.HasValue ||
        FolioTo.HasValue ||
        !string.IsNullOrWhiteSpace(CustomerCode) ||
        WarehouseNumber.HasValue ||
        !string.IsNullOrWhiteSpace(InvoiceStatus) ||
        !string.IsNullOrWhiteSpace(FiscalPaymentMethod);
}
