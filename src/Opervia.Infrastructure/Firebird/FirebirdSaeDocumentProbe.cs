using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeDocumentProbe(
    ILogger<FirebirdSaeDocumentProbe> logger
) : ISaeDocumentProbe
{
    public async Task<SaeDocumentProbeResult> ReadLatestAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind documentKind,
        CancellationToken cancellationToken = default
    )
    {
        var tableName = ResolveTableName(
            profile,
            documentKind
        );

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
                SELECT FIRST 5
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
                ORDER BY
                    FECHA_DOC DESC,
                    CVE_DOC DESC
                """;

            await using var command =
                new FbCommand(sql, connection)
                {
                    CommandTimeout = 15
                };

            await using var reader =
                await command.ExecuteReaderAsync(
                    cancellationToken
                );

            var documents =
                new List<SaeDocumentHeader>();

            while (await reader.ReadAsync(
                cancellationToken
            ))
            {
                documents.Add(
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
                    )
                );
            }

            stopwatch.Stop();

            return new SaeDocumentProbeResult(
                true,
                $"Se leyeron {documents.Count} documentos.",
                tableName,
                documents,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return CreateFailure(
                tableName,
                "La lectura fue cancelada.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (FbException exception)
        {
            stopwatch.Stop();

            logger.LogWarning(
                exception,
                "Firebird rechazó una consulta de documentos."
            );

            return CreateFailure(
                tableName,
                "Firebird rechazó la consulta de documentos.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una consulta de documentos."
            );

            return CreateFailure(
                tableName,
                "No fue posible leer los documentos.",
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
                    nameof(documentKind),
                    documentKind,
                    "El tipo de documento no es válido."
                )
            };

        return profile.ResolveTableName(
            baseTableName
        );
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
            : Convert.ToInt32(
                reader.GetValue(ordinal)
            );
    }

    private static decimal? GetNullableDecimal(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToDecimal(
                reader.GetValue(ordinal)
            );
    }

    private static SaeDocumentProbeResult CreateFailure(
        string tableName,
        string message,
        long elapsedMilliseconds
    )
    {
        return new SaeDocumentProbeResult(
            false,
            message,
            tableName,
            Array.Empty<SaeDocumentHeader>(),
            elapsedMilliseconds
        );
    }
}
