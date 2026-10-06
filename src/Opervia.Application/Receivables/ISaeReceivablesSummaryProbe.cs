using Opervia.Domain.Connections;

namespace Opervia.Application.Receivables;

public interface ISaeReceivablesSummaryProbe
{
    Task<SaeReceivablesSummaryResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly periodStart,
        DateOnly periodEnd,
        SaeReceivablesSummaryFilter filters,
        int invoicePage,
        int invoicePageSize,
        CancellationToken cancellationToken = default,
        bool includeInvoices = true
    );
}
