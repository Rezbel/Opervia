using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeDocumentLookup(
    ILogger<FirebirdSaeDocumentLookup> logger
) : ISaeDocumentLookup
{
    public async Task<SaeDocumentLookupResult> FindAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind documentKind,
        string documentNumber,
        CancellationToken cancellationToken = default
    )
    {
        var normalizedDocumentNumber =
            documentNumber?.Trim();

        if (string.IsNullOrWhiteSpace(normalizedDocumentNumber))
        {
            throw new ArgumentException(
                "El número de documento es obligatorio.",
                nameof(documentNumber)
            );
        }

        var tableName =
            ResolveTableName(profile, documentKind);

        var stopwatch = Stopwatch.StartNew();
        var connectionWasOpened = false;

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
            connectionWasOpened = true;

            var sql = $"""
                SELECT FIRST 1
                    TIP_DOC,
                    CVE_DOC,
                    CVE_CLPV,
                    STATUS,
                    FECHA_DOC,
                    FECHA_CANCELA,
                    CVE_VEND,
                    NUM_ALMA,
                    CAN_TOT,
                    DES_TOT,
                    COALESCE(IMP_TOT1, 0) + COALESCE(IMP_TOT2, 0) +
                    COALESCE(IMP_TOT3, 0) + COALESCE(IMP_TOT4, 0) +
                    COALESCE(IMP_TOT5, 0) + COALESCE(IMP_TOT6, 0) +
                    COALESCE(IMP_TOT7, 0) + COALESCE(IMP_TOT8, 0),
                    IMPORTE,
                    ENLAZADO,
                    TIP_DOC_ANT,
                    DOC_ANT,
                    TIP_DOC_SIG,
                    DOC_SIG
                FROM {tableName}
                WHERE CVE_DOC = @DOCUMENT_NUMBER
                """;

            await using var command =
                new FbCommand(sql, connection)
                {
                    CommandTimeout = 15
                };

            command.Parameters.AddWithValue(
                "@DOCUMENT_NUMBER",
                normalizedDocumentNumber
            );

            await using var reader =
                await command.ExecuteReaderAsync(
                    cancellationToken
                );

            if (!await reader.ReadAsync(cancellationToken))
            {
                stopwatch.Stop();

                return new SaeDocumentLookupResult(
                    false,
                    $"No se encontró {normalizedDocumentNumber} en {tableName}.",
                    tableName,
                    null,
                    stopwatch.ElapsedMilliseconds
                );
            }

            var document =
                new SaeDocumentHeader(
                    GetNullableString(reader, 0),
                    GetNullableString(reader, 1)
                        ?? string.Empty,
                    GetNullableString(reader, 2)
                        ?? string.Empty,
                    GetNullableString(reader, 3),
                    GetNullableDateTime(reader, 4),
                    GetNullableDateTime(reader, 5),
                    GetNullableString(reader, 6),
                    GetNullableInt32(reader, 7),
                    GetNullableDecimal(reader, 8),
                    GetNullableDecimal(reader, 11),
                    (GetNullableDecimal(reader, 8) ?? 0) -
                        (GetNullableDecimal(reader, 9) ?? 0),
                    GetNullableDecimal(reader, 10),
                    GetNullableString(reader, 12),
                    GetNullableString(reader, 13),
                    GetNullableString(reader, 14),
                    GetNullableString(reader, 15),
                    GetNullableString(reader, 16)
                );

            stopwatch.Stop();

            return new SaeDocumentLookupResult(
                true,
                "El documento fue encontrado correctamente.",
                tableName,
                document,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una búsqueda de documento."
            );

            return new SaeDocumentLookupResult(
                false,
                connectionWasOpened
                    ? "Firebird respondió, pero no fue posible consultar el documento. Revisa la estructura de la empresa SAE."
                    : $"No fue posible conectar con Firebird en {profile.Host}:{profile.Port}. Verifica que el servidor esté encendido, la red o VPN y el puerto configurado.",
                tableName,
                null,
                stopwatch.ElapsedMilliseconds
            );
        }
    }

    private static string ResolveTableName(
        SaeConnectionProfile profile,
        SaeDocumentKind documentKind
    )
    {
        var baseTableName =
            documentKind switch
            {
                SaeDocumentKind.Quotation => "FACTC",
                SaeDocumentKind.Order => "FACTP",
                SaeDocumentKind.Delivery => "FACTR",
                SaeDocumentKind.Invoice => "FACTF",

                _ => throw new ArgumentOutOfRangeException(
                    nameof(documentKind)
                )
            };

        return profile.ResolveTableName(baseTableName);
    }

    private static string? GetNullableString(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : reader.GetString(ordinal).Trim();
    }

    private static DateTime? GetNullableDateTime(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : reader.GetDateTime(ordinal);
    }

    private static int? GetNullableInt32(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToInt32(reader.GetValue(ordinal));
    }

    private static decimal? GetNullableDecimal(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToDecimal(reader.GetValue(ordinal));
    }
}
