using Opervia.Domain.Connections;

namespace Opervia.Application.Receivables;

public sealed record SaeReceivableInvoiceListingResult(
    bool IsSuccessful, string Message, DateOnly PeriodStart, DateOnly PeriodEnd,
    IReadOnlyList<SaeReceivableInvoiceRow> Invoices, int InvoicePage, int InvoicePageSize,
    int TotalInvoiceCount, long ElapsedMilliseconds);

public interface ISaeReceivableInvoiceListingProbe
{
    Task<SaeReceivableInvoiceListingResult> ReadAsync(SaeConnectionProfile profile, string password,
        DateOnly from, DateOnly to, string? search, int page, int pageSize, CancellationToken token = default,
        SaeReceivablesSummaryFilter? filters = null);
}
