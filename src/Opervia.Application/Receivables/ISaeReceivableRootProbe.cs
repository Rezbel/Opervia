using Opervia.Domain.Connections;

namespace Opervia.Application.Receivables;

public interface ISaeReceivableRootProbe
{
    Task<SaeReceivableRootResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        string documentNumber,
        CancellationToken cancellationToken = default
    );
}
