using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Tables;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeTableStructureInspector
    : ISaeTableStructureInspector
{
    public async Task<SaeTableStructureResult> InspectAsync(
        SaeConnectionProfile profile,
        string password,
        string tableName,
        CancellationToken cancellationToken = default
    )
    {
        var normalizedTableName =
            NormalizeTableName(tableName);

        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var connection =
                FirebirdConnectionFactory.Create(profile, password);

            await connection.OpenAsync(cancellationToken);

            const string sql = """
                SELECT
                    RF.RDB$FIELD_POSITION,
                    TRIM(RF.RDB$FIELD_NAME),
                    F.RDB$FIELD_TYPE,
                    F.RDB$FIELD_SUB_TYPE,
                    F.RDB$FIELD_LENGTH,
                    F.RDB$FIELD_SCALE,
                    RF.RDB$NULL_FLAG
                FROM RDB$RELATION_FIELDS RF
                INNER JOIN RDB$FIELDS F
                    ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE
                WHERE RF.RDB$RELATION_NAME = @TABLE_NAME
                ORDER BY RF.RDB$FIELD_POSITION
                """;

            await using var command =
                new FbCommand(sql, connection)
                {
                    CommandTimeout = 15
                };

            command.Parameters.AddWithValue(
                "@TABLE_NAME",
                normalizedTableName
            );

            await using var reader =
                await command.ExecuteReaderAsync(cancellationToken);

            var columns =
                new List<SaeColumnDefinition>();

            while (await reader.ReadAsync(cancellationToken))
            {
                var position = reader.GetInt16(0);
                var name = reader.GetString(1).Trim();
                var fieldType = reader.GetInt16(2);

                var fieldSubtype =
                    reader.IsDBNull(3)
                        ? (short)0 : reader.GetInt16(3);

                var length =
                    reader.IsDBNull(4)
                        ? 0
                        : reader.GetInt16(4);

                var scale =
                    reader.IsDBNull(5)
                        ? (short)0 : reader.GetInt16(5);

                var isNullable =
                    reader.IsDBNull(6) ||
                    reader.GetInt16(6) != 1;

                columns.Add(
                    new SaeColumnDefinition(
                        position,
                        name,
                        ResolveDataType(
                            fieldType,
                            fieldSubtype,
                            scale
                        ),
                        length,
                        scale,
                        isNullable
                    )
                );
            }

            stopwatch.Stop();

            if (columns.Count == 0)
            {
                return new SaeTableStructureResult(
                    false,
                    $"No se encontró la tabla {normalizedTableName}.",
                    normalizedTableName,
                    Array.Empty<SaeColumnDefinition>(),
                    stopwatch.ElapsedMilliseconds
                );
            }

            return new SaeTableStructureResult(
                true,
                "La estructura de la tabla fue inspeccionada correctamente.",
                normalizedTableName,
                columns,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            return new SaeTableStructureResult(
                false,
                $"No fue posible inspeccionar la tabla: {exception.Message}",
                normalizedTableName,
                Array.Empty<SaeColumnDefinition>(),
                stopwatch.ElapsedMilliseconds
            );
        }
    }

    private static string NormalizeTableName(
        string tableName
    )
    {
        var normalized =
            tableName?.Trim().ToUpperInvariant();

        if (string.IsNullOrWhiteSpace(normalized) ||
            !normalized.All(character =>
                char.IsLetterOrDigit(character) ||
                character == '_'
            ))
        {
            throw new ArgumentException(
                "El nombre de la tabla no es válido.",
                nameof(tableName)
            );
        }

        return normalized;
    }

    private static string ResolveDataType(
        short fieldType,
        short fieldSubtype,
        short scale
    )
    {
        return fieldType switch
        {
            7 when fieldSubtype > 0 => "NUMERIC",
            7 => "SMALLINT",

            8 when fieldSubtype > 0 => "NUMERIC",
            8 => "INTEGER",

            10 => "FLOAT",
            12 => "DATE",
            13 => "TIME",
            14 => "CHAR",

            16 when fieldSubtype > 0 || scale < 0
                => "NUMERIC",

            16 => "BIGINT",
            27 => "DOUBLE PRECISION",
            35 => "TIMESTAMP",
            37 => "VARCHAR",
            261 => "BLOB",

            _ => $"FIREBIRD_TYPE_{fieldType}"
        };
    }
}

