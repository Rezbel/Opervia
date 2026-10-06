using Opervia.Domain.Connections;

namespace Opervia.Application.Customers;

public interface ISaeCustomerPortfolioProbe
{
    Task<SaeCustomerPortfolioResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly from,
        DateOnly to,
        SaeCustomerPortfolioFilter filter,
        CancellationToken cancellationToken = default
    );
}
