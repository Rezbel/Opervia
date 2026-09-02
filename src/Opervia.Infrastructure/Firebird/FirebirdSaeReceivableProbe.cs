using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeReceivableProbe(
    ILogger<FirebirdSaeReceivableProbe> logger
)
    : ISaeReceivableProbe
{
    private const int MaximumMovements = 100;

    public async Task<SaeReceivableProbeResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
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

        var rootTableName =
            profile.ResolveTableName("CUEN_M");

        var movementsTableName =
            profile.ResolveTableName("CUEN_DET");

        var conceptsTableName =
            profile.ResolveTableName("CONC");

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

            var rootSql = $"""
                SELECT FIRST 1
                    M.CVE_CLIE,
                    M.UUID
                FROM {rootTableName} M
                WHERE UPPER(TRIM(M.NO_FACTURA)) =
                      UPPER(TRIM(@DOCUMENT_NUMBER))
                   OR UPPER(TRIM(M.REFER)) =
                      UPPER(TRIM(@DOCUMENT_NUMBER))
                   OR UPPER(TRIM(M.DOCTO)) =
                      UPPER(TRIM(@DOCUMENT_NUMBER))
                ORDER BY
                    CASE
                        WHEN M.SIGNO = 1 THEN 0
                        ELSE 1
                    END,
                    M.FECHA_APLI
                """;

            await using var rootCommand =
                new FbCommand(rootSql, connection)
                {
                    CommandTimeout = 15
                };

            rootCommand.Parameters.AddWithValue(
                "@DOCUMENT_NUMBER",
                normalizedDocumentNumber
            );

            string? rootCustomerCode;
            string? rootUuid;

            await using (
                var rootReader =
                    await rootCommand.ExecuteReaderAsync(
                        cancellationToken
                    )
            )
            {
                if (!await rootReader.ReadAsync(
                        cancellationToken
                    ))
                {
                    stopwatch.Stop();

                    return CreateFailure(
                        movementsTableName,
                        conceptsTableName,
                        normalizedDocumentNumber,
                        $"No se encontró el cargo original de {normalizedDocumentNumber}.",
                        stopwatch.ElapsedMilliseconds
                    );
                }

                rootCustomerCode =
                    GetString(rootReader, 0);

                rootUuid =
                    GetString(rootReader, 1);
            }

            var uuidCondition =
                string.IsNullOrWhiteSpace(rootUuid)
                    ? string.Empty
                    : """
                       OR UPPER(TRIM(D.UUID)) =
                          UPPER(TRIM(@ROOT_UUID))
                      """;

            var sql = $"""
                SELECT FIRST {MaximumMovements}
                    D.CVE_CLIE,
                    D.REFER,
                    D.ID_MOV,
                    D.NUM_CPTO,
                    C.DESCR,
                    C.TIPO,
                    D.NUM_CARGO,
                    D.NO_PARTIDA,
                    D.NO_FACTURA,
                    D.DOCTO,
                    D.IMPORTE,
                    D.FECHA_APLI,
                    D.FECHA_VENC,
                    D.TIPO_MOV,
                    D.SIGNO,
                    C.SIGNO,
                    D.REF_SIST,
                    D.OPERACIONPL,
                    D.REFBANCO_ORIGEN,
                    D.REFBANCO_DEST,
                    D.NUMCTAPAGO_ORIGEN,
                    D.NUMCTAPAGO_DESTINO,
                    D.NUMCHEQUE,
                    D.CVE_DOC_COMPPAGO,
                    D.ID_OPERACION,
                    D.UUID
                FROM {movementsTableName} D
                LEFT JOIN {conceptsTableName} C
                    ON C.NUM_CPTO = D.NUM_CPTO
                WHERE (
                       UPPER(TRIM(D.NO_FACTURA)) =
                       UPPER(TRIM(@DOCUMENT_NUMBER))

                    OR UPPER(TRIM(D.REFER)) =
                       UPPER(TRIM(@DOCUMENT_NUMBER))

                    OR UPPER(TRIM(D.DOCTO)) =
                       UPPER(TRIM(@DOCUMENT_NUMBER))

                    OR UPPER(TRIM(D.CVE_DOC_COMPPAGO)) =
                       UPPER(TRIM(@DOCUMENT_NUMBER))

                    {uuidCondition}
                )
                AND UPPER(TRIM(D.CVE_CLIE)) =
                    UPPER(TRIM(@CUSTOMER_CODE))
                ORDER BY
                    D.FECHA_APLI,
                    D.ID_MOV,
                    D.NO_PARTIDA
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

            command.Parameters.AddWithValue(
                "@CUSTOMER_CODE",
                rootCustomerCode ?? string.Empty
            );

            if (!string.IsNullOrWhiteSpace(rootUuid))
            {
                command.Parameters.AddWithValue(
                    "@ROOT_UUID",
                    rootUuid
                );
            }

            await using var reader =
                await command.ExecuteReaderAsync(
                    cancellationToken
                );

            var movements =
                new List<SaeReceivableMovement>();

            while (await reader.ReadAsync(
                cancellationToken
            ))
            {
                movements.Add(
                    new SaeReceivableMovement(
                        GetString(reader, 0)
                            ?? string.Empty,
                        GetString(reader, 1),
                        GetInt32(reader, 2) ?? 0,
                        GetInt32(reader, 3) ?? 0,
                        GetString(reader, 4),
                        GetString(reader, 5),
                        GetInt32(reader, 6),
                        GetInt32(reader, 7) ?? 0,
                        GetString(reader, 8),
                        GetString(reader, 9),
                        GetDecimal(reader, 10),
                        GetDateTime(reader, 11),
                        GetDateTime(reader, 12),
                        GetString(reader, 13),
                        GetInt32(reader, 14),
                        GetInt32(reader, 15),
                        GetString(reader, 16),
                        GetString(reader, 17),
                        GetString(reader, 18),
                        GetString(reader, 19),
                        GetString(reader, 20),
                        GetString(reader, 21),
                        GetString(reader, 22),
                        GetString(reader, 23),
                        GetString(reader, 24),
                        GetString(reader, 25)
                    )
                );
            }

            stopwatch.Stop();

            if (movements.Count == 0)
            {
                return new SaeReceivableProbeResult(
                    false,
                    $"CUEN_DET no contiene aplicaciones vinculadas directamente a {normalizedDocumentNumber} ni a su UUID {rootUuid ?? "vacío"}.",
                    movementsTableName,
                    conceptsTableName,
                    normalizedDocumentNumber,
                    Array.Empty<SaeReceivableMovement>(),
                    stopwatch.ElapsedMilliseconds
                );
            }

            return new SaeReceivableProbeResult(
                true,
                $"Se encontraron {movements.Count} movimientos vinculados al documento o a su UUID.",
                movementsTableName,
                conceptsTableName,
                normalizedDocumentNumber,
                movements,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return CreateFailure(
                movementsTableName,
                conceptsTableName,
                normalizedDocumentNumber,
                "La consulta fue cancelada.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (FbException exception)
        {
            stopwatch.Stop();

            logger.LogWarning(
                exception,
                "Firebird rechazó una consulta de cobranza."
            );

            return CreateFailure(
                movementsTableName,
                conceptsTableName,
                normalizedDocumentNumber,
                "Firebird rechazó la consulta de cobranza.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una consulta de cobranza."
            );

            return CreateFailure(
                movementsTableName,
                conceptsTableName,
                normalizedDocumentNumber,
                "No fue posible consultar la información de cobranza.",
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

    private static int? GetInt32(
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

    private static decimal? GetDecimal(
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

    private static DateTime? GetDateTime(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToDateTime(
                reader.GetValue(ordinal)
            );
    }

    private static SaeReceivableProbeResult CreateFailure(
        string movementsTableName,
        string conceptsTableName,
        string documentNumber,
        string message,
        long elapsedMilliseconds
    )
    {
        return new SaeReceivableProbeResult(
            false,
            message,
            movementsTableName,
            conceptsTableName,
            documentNumber,
            Array.Empty<SaeReceivableMovement>(),
            elapsedMilliseconds
        );
    }
}
