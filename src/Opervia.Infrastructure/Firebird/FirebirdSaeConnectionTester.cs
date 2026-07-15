using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Connections;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeConnectionTester : ISaeConnectionTester
{
    public async Task<SaeConnectionTestResult> TestAsync(
        SaeConnectionProfile profile,
        string password,
        CancellationToken cancellationToken = default
    )
    {
        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var connection =
                FirebirdConnectionFactory.Create(profile, password);

            await connection.OpenAsync(cancellationToken);

            stopwatch.Stop();

            return new SaeConnectionTestResult(
                true,
                "La conexión con Firebird se realizó correctamente.",
                connection.ServerVersion,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return new SaeConnectionTestResult(
                false,
                "La prueba de conexión fue cancelada.",
                null,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (FbException exception)
        {
            stopwatch.Stop();

            return new SaeConnectionTestResult(
                false,
                $"Firebird rechazó la conexión: {exception.Message}",
                null,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            return new SaeConnectionTestResult(
                false,
                $"No fue posible establecer la conexión: {exception.Message}",
                null,
                stopwatch.ElapsedMilliseconds
            );
        }
    }
}
