using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeReceivableRootProbe(
    ILogger<FirebirdSaeReceivableRootProbe> logger
)
    : ISaeReceivableRootProbe
{
    public async Task<SaeReceivableRootResult> ReadAsync(
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

        var tableName =
            profile.ResolveTableName("CUEN_M");
        var invoiceTableName =
            profile.ResolveTableName("FACTF");

        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var connection =
                FirebirdConnectionFactory.Create(
                    profile,
                    password
                );

            await connection.OpenAsync(cancellationToken);

            var sql = $"""
                SELECT FIRST 1
                    M.CVE_CLIE,
                    M.REFER,
                    M.NUM_CPTO,
                    M.NUM_CARGO,
                    M.CVE_OBS,
                    M.NO_FACTURA,
                    M.DOCTO,
                    M.IMPORTE,
                    M.FECHA_APLI,
                    M.FECHA_VENC,
                    M.CVE_FOLIO,
                    M.CVE_BITA,
                    M.REF_SIST,
                    M.UUID,
                    M.STATUS,
                    M.SIGNO,
                    ABS(COALESCE(I.CAN_TOT, 0) - COALESCE(I.DES_TOT, 0))
                FROM {tableName} M
                LEFT JOIN {invoiceTableName} I
                    ON UPPER(TRIM(I.CVE_DOC)) = UPPER(TRIM(M.NO_FACTURA))
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

                return new SaeReceivableRootResult(
                    false,
                    $"No se encontró el cargo original de {normalizedDocumentNumber}.",
                    tableName,
                    normalizedDocumentNumber,
                    null,
                    stopwatch.ElapsedMilliseconds
                );
            }

            var root = new SaeReceivableRoot(
                GetString(reader, 0) ?? string.Empty,
                GetString(reader, 1),
                GetInt32(reader, 2) ?? 0,
                GetInt32(reader, 3) ?? 0,
                GetInt32(reader, 4),
                GetString(reader, 5),
                GetString(reader, 6),
                GetDecimal(reader, 7),
                GetDateTime(reader, 8),
                GetDateTime(reader, 9),
                GetInt32(reader, 10),
                GetInt32(reader, 11),
                GetString(reader, 12),
                GetString(reader, 13),
                GetString(reader, 14),
                GetInt32(reader, 15),
                GetDecimal(reader, 16)
            );

            stopwatch.Stop();

            return new SaeReceivableRootResult(
                true,
                "Se encontró el cargo original.",
                tableName,
                normalizedDocumentNumber,
                root,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una consulta de cargo original."
            );

            return new SaeReceivableRootResult(
                false,
                "No fue posible consultar el cargo original.",
                tableName,
                normalizedDocumentNumber,
                null,
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
            : Convert.ToInt32(reader.GetValue(ordinal));
    }

    private static decimal? GetDecimal(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToDecimal(reader.GetValue(ordinal));
    }

    private static DateTime? GetDateTime(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToDateTime(reader.GetValue(ordinal));
    }
}
