using Opervia.Domain.Connections;

namespace Opervia.Application.Flows;

public interface ISaeSalesFlowSummaryProbe
{
    Task<SaeSalesFlowSummaryResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly from,
        DateOnly to,
        string? sellerCode,
        CancellationToken cancellationToken = default
    );
}
