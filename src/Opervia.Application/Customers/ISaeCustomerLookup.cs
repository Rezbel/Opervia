using Opervia.Domain.Connections;

namespace Opervia.Application.Customers;

public interface ISaeCustomerLookup
{
    Task<SaeCustomerLookupResult> FindAsync(
        SaeConnectionProfile profile,
        string password,
        string customerCode,
        CancellationToken cancellationToken = default
    );
}
