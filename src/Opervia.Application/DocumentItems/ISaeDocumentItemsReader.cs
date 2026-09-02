using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Application.DocumentItems;

public interface ISaeDocumentItemsReader
{
    Task<SaeDocumentItemsResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind documentKind,
        string documentNumber,
        CancellationToken cancellationToken = default
    );
}
