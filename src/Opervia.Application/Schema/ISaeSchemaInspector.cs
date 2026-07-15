using Opervia.Domain.Connections;

namespace Opervia.Application.Schema;

public interface ISaeSchemaInspector
{
    Task<SaeSchemaInspectionResult> InspectAsync(
        SaeConnectionProfile profile,
        string password,
        CancellationToken cancellationToken = default
    );
}
