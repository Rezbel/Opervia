using Opervia.Domain.Connections;

namespace Opervia.Application.Tables;

public interface ISaeTableStructureInspector
{
    Task<SaeTableStructureResult> InspectAsync(
        SaeConnectionProfile profile,
        string password,
        string tableName,
        CancellationToken cancellationToken = default
    );
}
