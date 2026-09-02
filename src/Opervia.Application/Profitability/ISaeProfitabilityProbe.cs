using Opervia.Domain.Connections;

namespace Opervia.Application.Profitability;

public interface ISaeProfitabilityProbe
{
    Task<SaeProfitabilityResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly periodStart,
        DateOnly periodEnd,
        string? branch,
        string? sellerCode,
        CancellationToken cancellationToken = default
    );
}
