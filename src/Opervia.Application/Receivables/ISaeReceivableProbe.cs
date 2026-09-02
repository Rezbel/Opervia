using Opervia.Domain.Connections;

namespace Opervia.Application.Receivables;

public interface ISaeReceivableProbe
{
    Task<SaeReceivableProbeResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        string documentNumber,
        CancellationToken cancellationToken = default
    );
}
