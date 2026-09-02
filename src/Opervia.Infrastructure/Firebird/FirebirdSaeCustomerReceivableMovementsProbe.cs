using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Receivables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeCustomerReceivableMovementsProbe(
    ILogger<FirebirdSaeCustomerReceivableMovementsProbe> logger
)
    : ISaeCustomerReceivableMovementsProbe
{
    private const int MaximumMovements = 100;

    public async Task<SaeCustomerReceivableMovementsResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        string customerCode,
        CancellationToken cancellationToken = default
    )
    {
        var normalizedCustomerCode = customerCode?.Trim();

        if (string.IsNullOrWhiteSpace(normalizedCustomerCode))
        {
            throw new ArgumentException(
                "La clave del cliente es obligatoria.",
                nameof(customerCode)
            );
        }

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

            await connection.OpenAsync(cancellationToken);

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
                WHERE UPPER(TRIM(D.CVE_CLIE)) =
                      UPPER(TRIM(@CUSTOMER_CODE))
                ORDER BY
                    D.FECHA_APLI DESC,
                    D.ID_MOV DESC,
                    D.NO_PARTIDA DESC
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

            var movements =
                new List<SaeReceivableMovement>();

            while (await reader.ReadAsync(cancellationToken))
            {
                movements.Add(
                    new SaeReceivableMovement(
                        GetString(reader, 0) ?? string.Empty,
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

            return new SaeCustomerReceivableMovementsResult(
                true,
                $"Se leyeron {movements.Count} movimientos recientes del cliente.",
                movementsTableName,
                conceptsTableName,
                normalizedCustomerCode,
                movements,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una consulta de movimientos del cliente."
            );

            return new SaeCustomerReceivableMovementsResult(
                false,
                "No fue posible leer los movimientos del cliente.",
                movementsTableName,
                conceptsTableName,
                normalizedCustomerCode,
                Array.Empty<SaeReceivableMovement>(),
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
