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
        CancellationToken cancellationToken = default
    );
}
