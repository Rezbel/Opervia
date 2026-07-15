using Opervia.Domain.Connections;

namespace Opervia.Application.Connections;

public interface ISaeConnectionTester
{
    Task<SaeConnectionTestResult> TestAsync(
        SaeConnectionProfile profile,
        string password,
        CancellationToken cancellationToken = default
    );
}
