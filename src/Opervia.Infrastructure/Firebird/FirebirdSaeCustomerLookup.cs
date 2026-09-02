using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Customers;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeCustomerLookup(
    ILogger<FirebirdSaeCustomerLookup> logger
)
    : ISaeCustomerLookup
{
    public async Task<SaeCustomerLookupResult> FindAsync(
        SaeConnectionProfile profile,
        string password,
        string customerCode,
        CancellationToken cancellationToken = default
    )
    {
        var normalizedCustomerCode =
            customerCode?.Trim();

        if (string.IsNullOrWhiteSpace(normalizedCustomerCode))
        {
            throw new ArgumentException(
                "La clave del cliente es obligatoria.",
                nameof(customerCode)
            );
        }

        var tableName =
            profile.ResolveTableName("CLIE");

        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var connection =
                FirebirdConnectionFactory.Create(
                    profile,
                    password
                );

            await connection.OpenAsync(
                cancellationToken
            );

            var sql = $"""
                SELECT FIRST 1
                    CLAVE,
                    NOMBRE,
                    NOMBRECOMERCIAL,
                    RFC,
                    TELEFONO,
                    EMAILPRED
                FROM {tableName}
                WHERE UPPER(TRIM(CLAVE)) = UPPER(TRIM(@CUSTOMER_CODE))
                """;

            await using var command =
                new FbCommand(sql, connection)
                {
                    CommandTimeout = 15
                };

            command.Parameters.AddWithValue(
                "@CUSTOMER_CODE",
                normalizedCustomerCode
            );

            await using var reader =
                await command.ExecuteReaderAsync(
                    cancellationToken
                );

            if (!await reader.ReadAsync(cancellationToken))
            {
                stopwatch.Stop();

                return new SaeCustomerLookupResult(
                    false,
                    $"No se encontró el cliente {normalizedCustomerCode}.",
                    tableName,
                    null,
                    stopwatch.ElapsedMilliseconds
                );
            }

            var customer = new SaeCustomer(
                GetString(reader, 0)
                    ?? normalizedCustomerCode,
                GetString(reader, 1),
                GetString(reader, 2),
                GetString(reader, 3),
                GetString(reader, 4),
                GetString(reader, 5)
            );

            stopwatch.Stop();

            return new SaeCustomerLookupResult(
                true,
                "El cliente fue encontrado correctamente.",
                tableName,
                customer,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return CreateFailure(
                tableName,
                "La búsqueda del cliente fue cancelada.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (FbException exception)
        {
            stopwatch.Stop();

            logger.LogWarning(
                exception,
                "Firebird rechazó una consulta de cliente."
            );

            return CreateFailure(
                tableName,
                "Firebird rechazó la consulta del cliente.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una consulta de cliente."
            );

            return CreateFailure(
                tableName,
                "No fue posible consultar el cliente.",
                stopwatch.ElapsedMilliseconds
            );
        }
    }

    private static string? GetString(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : reader.GetString(ordinal).Trim();
    }

    private static SaeCustomerLookupResult CreateFailure(
        string tableName,
        string message,
        long elapsedMilliseconds
    )
    {
        return new SaeCustomerLookupResult(
            false,
            message,
            tableName,
            null,
            elapsedMilliseconds
        );
    }
}

