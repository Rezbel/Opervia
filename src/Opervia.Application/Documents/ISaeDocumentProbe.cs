using Opervia.Domain.Connections;

namespace Opervia.Application.Documents;

public interface ISaeDocumentProbe
{
    Task<SaeDocumentProbeResult> ReadLatestAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind documentKind,
        CancellationToken cancellationToken = default
    );
}
