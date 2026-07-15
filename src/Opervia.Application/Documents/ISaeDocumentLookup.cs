using Opervia.Domain.Connections;

namespace Opervia.Application.Documents;

public interface ISaeDocumentLookup
{
    Task<SaeDocumentLookupResult> FindAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind documentKind,
        string documentNumber,
        CancellationToken cancellationToken = default
    );
}
