using Opervia.Domain.Connections;

namespace Opervia.Application.Receivables;

public interface ISaeCustomerReceivableMovementsProbe
{
    Task<SaeCustomerReceivableMovementsResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        string customerCode,
        CancellationToken cancellationToken = default
    );
}
