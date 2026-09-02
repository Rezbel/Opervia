using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Connections;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeConnectionTester(
    ILogger<FirebirdSaeConnectionTester> logger
) : ISaeConnectionTester
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

            logger.LogWarning(
                exception,
                "Firebird rechazó una prueba de conexión."
            );

            return new SaeConnectionTestResult(
                false,
                "Firebird rechazó la conexión. Verifica el servidor, la base y las credenciales.",
                null,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una prueba de conexión con Firebird."
            );

            return new SaeConnectionTestResult(
                false,
                "No fue posible establecer la conexión con Firebird.",
                null,
                stopwatch.ElapsedMilliseconds
            );
        }
    }
}
