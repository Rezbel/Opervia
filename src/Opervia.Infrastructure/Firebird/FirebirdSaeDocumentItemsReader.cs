using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.DocumentItems;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeDocumentItemsReader(
    ILogger<FirebirdSaeDocumentItemsReader> logger
)
    : ISaeDocumentItemsReader
{
    private const int MaximumItems = 100;
    private const int MaximumItemsToRead = MaximumItems + 1;

    public async Task<SaeDocumentItemsResult> ReadAsync(
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
                SELECT FIRST {MaximumItemsToRead}
                    NUM_PAR,
                    CVE_ART,
                    DESCR_ART,
                    CANT,
                    PREC,
                    PREC_NETO,
                    COST,
                    COALESCE(CANT, 0) * COALESCE(PREC, 0) *
                    (1 - COALESCE(DESC1, 0) / 100.0) *
                    (1 - COALESCE(DESC2, 0) / 100.0) *
                    (1 - COALESCE(DESC3, 0) / 100.0),
                    COALESCE(TOTIMP1, 0) + COALESCE(TOTIMP2, 0) +
                    COALESCE(TOTIMP3, 0) + COALESCE(TOTIMP4, 0) +
                    COALESCE(TOTIMP5, 0) + COALESCE(TOTIMP6, 0) +
                    COALESCE(TOTIMP7, 0) + COALESCE(TOTIMP8, 0),
                    PRECCIMP,
                    DESC1,
                    DESC2,
                    DESC3,
                    NUM_ALM,
                    NUM_MOV,
                    E_LTPD,
                    UNI_VENTA
                FROM {tableName}
                WHERE CVE_DOC = @DOCUMENT_NUMBER
                ORDER BY NUM_PAR
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

            var items =
                new List<SaeDocumentItem>();

            while (await reader.ReadAsync(cancellationToken))
            {
                items.Add(
                    new SaeDocumentItem(
                        GetInt32(reader, 0),
                        GetString(reader, 1),
                        GetString(reader, 2),
                        GetDecimal(reader, 3),
                        GetDecimal(reader, 4),
                        GetDecimal(reader, 5),
                        GetDecimal(reader, 6),
                        GetDecimal(reader, 7),
                        GetDecimal(reader, 8),
                        (GetDecimal(reader, 7) ?? 0) +
                            (GetDecimal(reader, 8) ?? 0),
                        GetDecimal(reader, 9),
                        GetDecimal(reader, 10),
                        GetDecimal(reader, 11),
                        GetDecimal(reader, 12),
                        GetNullableInt32(reader, 13),
                        GetNullableInt32(reader, 14),
                        GetNullableInt32(reader, 15),
                        GetString(reader, 16)
                    )
                );
            }

            var isTruncated = items.Count > MaximumItems;

            if (isTruncated)
            {
                items.RemoveRange(
                    MaximumItems,
                    items.Count - MaximumItems
                );
            }

            stopwatch.Stop();

            if (items.Count == 0)
            {
                return new SaeDocumentItemsResult(
                    false,
                    $"No se encontraron partidas para {normalizedDocumentNumber}.",
                    tableName,
                    normalizedDocumentNumber,
                    Array.Empty<SaeDocumentItem>(),
                    0,
                    0,
                    0,
                    false,
                    stopwatch.ElapsedMilliseconds
                );
            }

            var totalQuantity =
                items.Sum(item => item.Quantity ?? 0);

            var totalAmount =
                items.Sum(item => item.LineTotal ?? 0);
            var totalAmountWithTax =
                items.Sum(item => item.LineTotalWithTax ?? 0);

            return new SaeDocumentItemsResult(
                true,
                isTruncated
                    ? $"Se muestran las primeras {MaximumItems} partidas; el documento contiene más registros."
                    : $"Se leyeron {items.Count} partidas.",
                tableName,
                normalizedDocumentNumber,
                items,
                totalQuantity,
                totalAmount,
                totalAmountWithTax,
                isTruncated,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return CreateFailure(
                tableName,
                normalizedDocumentNumber,
                "La lectura de partidas fue cancelada.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (FbException exception)
        {
            stopwatch.Stop();

            logger.LogWarning(
                exception,
                "Firebird rechazó una consulta de partidas."
            );

            return CreateFailure(
                tableName,
                normalizedDocumentNumber,
                "Firebird rechazó la consulta de partidas.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            logger.LogError(
                exception,
                "Falló una consulta de partidas."
            );

            return CreateFailure(
                tableName,
                normalizedDocumentNumber,
                "No fue posible leer las partidas del documento.",
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
                SaeDocumentKind.Quotation => "PAR_FACTC",
                SaeDocumentKind.Order => "PAR_FACTP",
                SaeDocumentKind.Delivery => "PAR_FACTR",
                SaeDocumentKind.Invoice => "PAR_FACTF",

                _ => throw new ArgumentOutOfRangeException(
                    nameof(documentKind),
                    documentKind,
                    "El tipo de documento no es válido."
                )
            };

        return profile.ResolveTableName(baseTableName);
    }

    private static int GetInt32(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? 0
            : Convert.ToInt32(reader.GetValue(ordinal));
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

    private static decimal? GetDecimal(
        FbDataReader reader,
        int ordinal
    )
    {
        return reader.IsDBNull(ordinal)
            ? null
            : Convert.ToDecimal(reader.GetValue(ordinal));
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

    private static SaeDocumentItemsResult CreateFailure(
        string tableName,
        string documentNumber,
        string message,
        long elapsedMilliseconds
    )
    {
        return new SaeDocumentItemsResult(
            false,
            message,
            tableName,
            documentNumber,
            Array.Empty<SaeDocumentItem>(),
            0,
            0,
            0,
            false,
            elapsedMilliseconds
        );
    }
}
