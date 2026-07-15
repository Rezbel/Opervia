using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Schema;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeSchemaInspector : ISaeSchemaInspector
{
    private static readonly (string LogicalName, string BaseTableName)[]
        ExpectedTables =
        [
            ("Productos", "INVE"),
            ("Clientes", "CLIE"),
            ("Cotizaciones", "FACTC"),
            ("Pedidos", "FACTP"),
            ("Remisiones", "FACTR"),
            ("Facturas", "FACTF"),
            ("Movimientos de inventario", "MINVE"),
            ("Lotes y pedimentos", "LTPD"),
            ("Cuentas por cobrar", "CUEN_M"),
            ("Almacenes", "ALMACENES")
        ];

    public async Task<SaeSchemaInspectionResult> InspectAsync(
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

            const string sql = """
                SELECT TRIM(RDB$RELATION_NAME)
                FROM RDB$RELATIONS
                WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
                  AND RDB$VIEW_BLR IS NULL
                ORDER BY RDB$RELATION_NAME
                """;

            await using var command =
                new FbCommand(sql, connection)
                {
                    CommandTimeout = 15
                };

            await using var reader =
                await command.ExecuteReaderAsync(cancellationToken);

            var tableNames = new List<string>();

            while (await reader.ReadAsync(cancellationToken))
            {
                if (!reader.IsDBNull(0))
                {
                    tableNames.Add(reader.GetString(0).Trim());
                }
            }

            var tableSet = new HashSet<string>(
                tableNames,
                StringComparer.OrdinalIgnoreCase
            );

            var expectedTableStatuses = ExpectedTables
                .Select(expected =>
                {
                    var physicalName =
                        profile.ResolveTableName(expected.BaseTableName);

                    return new SaeTableStatus(
                        expected.LogicalName,
                        physicalName,
                        tableSet.Contains(physicalName)
                    );
                })
                .ToArray();

            var companyTables = tableNames
                .Where(tableName =>
                    tableName.EndsWith(
                        profile.CompanyNumber,
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                .OrderBy(tableName => tableName)
                .ToArray();

            stopwatch.Stop();

            return new SaeSchemaInspectionResult(
                true,
                "La estructura de la empresa SAE fue inspeccionada correctamente.",
                connection.ServerVersion,
                tableNames.Count,
                companyTables.Length,
                expectedTableStatuses,
                companyTables,
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();

            return CreateFailureResult(
                "La inspección fue cancelada.",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (FbException exception)
        {
            stopwatch.Stop();

            return CreateFailureResult(
                $"Firebird rechazó la inspección: {exception.Message}",
                stopwatch.ElapsedMilliseconds
            );
        }
        catch (Exception exception)
        {
            stopwatch.Stop();

            return CreateFailureResult(
                $"No fue posible inspeccionar la estructura: {exception.Message}",
                stopwatch.ElapsedMilliseconds
            );
        }
    }

    private static SaeSchemaInspectionResult CreateFailureResult(
        string message,
        long elapsedMilliseconds
    )
    {
        return new SaeSchemaInspectionResult(
            false,
            message,
            null,
            0,
            0,
            Array.Empty<SaeTableStatus>(),
            Array.Empty<string>(),
            elapsedMilliseconds
        );
    }
}
