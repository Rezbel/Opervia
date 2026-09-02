using System.Text.Json;
using System.Text.RegularExpressions;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.ArtificialIntelligence;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdOperviaAiEvidenceProbe
    : IOperviaAiEvidenceProbe
{
    private static readonly HashSet<string> StopWords = new(
        [
            "cual", "cuanto", "cuantos", "donde", "como", "cuando",
            "que", "quien", "fue", "era", "del", "una", "uno", "unos",
            "unas", "los", "las", "por", "con", "sin", "mas", "menos",
            "quiero", "saber", "dime", "favor", "tiene", "tenemos",
            "esto", "esta", "este", "estos", "estas", "para", "sobre",
            "entre", "desde", "hasta", "producto", "productos", "articulo",
            "articulos", "stock", "existencia", "existencias", "inventario",
            "cliente", "clientes", "venta", "ventas", "factura", "facturas",
            "ultima", "ultimo", "ultimas", "ultimos", "cerrada", "cerrado",
            "vigente", "cancelada", "cancelado", "total", "aspel", "sae"
        ],
        StringComparer.OrdinalIgnoreCase);

    public async Task<string> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        string question,
        CancellationToken cancellationToken)
    {
        var tokens = ExtractTokens(question);
        var inventoryTable = profile.ResolveTableName("INVE");
        var multiTable = profile.ResolveTableName("MULT");
        var warehousesTable = profile.ResolveTableName("ALMACENES");
        var customersTable = profile.ResolveTableName("CLIE");
        var invoicesTable = profile.ResolveTableName("FACTF");
        var invoiceItemsTable = profile.ResolveTableName("PAR_FACTF");

        await using var connection =
            FirebirdConnectionFactory.Create(profile, password);
        await connection.OpenAsync(cancellationToken);

        var errors = new List<string>();
        async Task<List<object>> ReadSafelyAsync(
            string area,
            Func<Task<List<object>>> read)
        {
            try
            {
                return await read();
            }
            catch (FbException)
            {
                errors.Add($"No fue posible consultar {area} en esta empresa SAE.");
                return [];
            }
        }

        var products = await ReadSafelyAsync(
            "el catálogo de productos",
            () => ReadProductsAsync(
                connection, inventoryTable, tokens, cancellationToken));
        var warehouseStock = await ReadSafelyAsync(
            "las existencias por almacén",
            () => ReadWarehouseStockAsync(
                connection, inventoryTable, multiTable, warehousesTable,
                tokens, cancellationToken));
        var customers = await ReadSafelyAsync(
            "el catálogo de clientes",
            () => ReadCustomersAsync(
                connection, customersTable, tokens, cancellationToken));
        var customerFocused = question.Contains(
            "cliente", StringComparison.OrdinalIgnoreCase);
        var invoiceFocused = question.Contains(
            "factura", StringComparison.OrdinalIgnoreCase);
        var invoiceTokens = invoiceFocused && tokens.Any(token => token.Contains('-'))
            ? tokens.Where(token => token.Contains('-')).ToArray()
            : customerFocused && tokens.Any(token => token.All(char.IsDigit))
                ? tokens.Where(token => token.All(char.IsDigit)).ToArray()
                : tokens;
        var selectedDocumentNumber = invoiceTokens.FirstOrDefault(
            token => token.Contains('-'));
        var selectedInvoice = await ReadSafelyAsync(
            "la factura seleccionada",
            () => ReadInvoiceHeaderAsync(
                connection, invoicesTable, customersTable,
                selectedDocumentNumber, cancellationToken));
        var invoices = await ReadSafelyAsync(
            "las facturas",
            () => ReadInvoicesAsync(
                connection, invoicesTable, customersTable, invoiceTokens,
                customerFocused,
                cancellationToken));
        var invoiceItems = await ReadSafelyAsync(
            "las partidas de la factura",
            () => ReadInvoiceItemsAsync(
                connection, invoiceItemsTable, inventoryTable,
                selectedDocumentNumber,
                cancellationToken));

        return JsonSerializer.Serialize(new
        {
            source = "Aspel SAE en vivo",
            accessMode = "SOLO LECTURA",
            generatedAt = DateTimeOffset.Now,
            searchTerms = tokens,
            products,
            stockByWarehouse = warehouseStock,
            matchingCustomers = customers,
            selectedInvoice,
            recentInvoices = invoices,
            invoiceItems,
            unavailableAreas = errors,
            notes = new[]
            {
                "STATUS C significa documento cancelado.",
                "Las facturas se ordenan de la fecha más reciente a la más antigua.",
                "EXIST es existencia global; stockByWarehouse detalla MULT por almacén."
            }
        });
    }

    private static string[] ExtractTokens(string question) =>
        Regex.Matches(question ?? string.Empty, @"[\p{L}\p{N}_-]{3,}")
            .Select(match => match.Value.Trim())
            .Where(value => !StopWords.Contains(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(6)
            .ToArray();

    private static async Task<List<object>> ReadProductsAsync(
        FbConnection connection,
        string table,
        IReadOnlyList<string> tokens,
        CancellationToken cancellationToken)
    {
        var filter = BuildFilter(tokens, "I.CVE_ART", "I.DESCR");
        var sql = $"""
            SELECT FIRST 8
                I.CVE_ART, I.DESCR, I.UNI_MED, COALESCE(I.EXIST, 0),
                COALESCE(I.STOCK_MIN, 0), COALESCE(I.STOCK_MAX, 0),
                COALESCE(I.COSTO_PROM, 0), I.FCH_ULTVTA, I.STATUS
            FROM {table} I
            WHERE COALESCE(I.STATUS, 'A') <> 'B'
              {filter.Sql}
            ORDER BY I.FCH_ULTVTA DESC, I.DESCR
            """;
        await using var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 20
        };
        AddTokenParameters(command, filter.Tokens, filter.ColumnCount);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<object>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new
            {
                productCode = Text(reader, 0),
                description = Text(reader, 1),
                unit = Text(reader, 2),
                totalStock = Decimal(reader, 3),
                minimumStock = Decimal(reader, 4),
                maximumStock = Decimal(reader, 5),
                averageCost = Decimal(reader, 6),
                lastSaleDate = Date(reader, 7),
                status = Text(reader, 8)
            });
        }
        return rows;
    }

    private static async Task<List<object>> ReadWarehouseStockAsync(
        FbConnection connection,
        string inventoryTable,
        string multiTable,
        string warehousesTable,
        IReadOnlyList<string> tokens,
        CancellationToken cancellationToken)
    {
        var filter = BuildFilter(tokens, "I.CVE_ART", "I.DESCR");
        var sql = $"""
            SELECT FIRST 24
                I.CVE_ART, I.DESCR, M.CVE_ALM,
                COALESCE(A.DESCR, 'Almacén ' || CAST(M.CVE_ALM AS VARCHAR(12))),
                COALESCE(M.EXIST, 0)
            FROM {inventoryTable} I
            INNER JOIN {multiTable} M ON M.CVE_ART = I.CVE_ART
            LEFT JOIN {warehousesTable} A ON A.CVE_ALM = M.CVE_ALM
            WHERE COALESCE(I.STATUS, 'A') <> 'B'
              {filter.Sql}
            ORDER BY I.DESCR, M.CVE_ALM
            """;
        await using var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 20
        };
        AddTokenParameters(command, filter.Tokens, filter.ColumnCount);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<object>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new
            {
                productCode = Text(reader, 0),
                description = Text(reader, 1),
                warehouseNumber = Integer(reader, 2),
                warehouse = Text(reader, 3),
                stock = Decimal(reader, 4)
            });
        }
        return rows;
    }

    private static async Task<List<object>> ReadCustomersAsync(
        FbConnection connection,
        string table,
        IReadOnlyList<string> tokens,
        CancellationToken cancellationToken)
    {
        var filter = BuildFilter(
            tokens, "C.CLAVE", "C.NOMBRE", "C.NOMBRECOMERCIAL", "C.RFC");
        var sql = $"""
            SELECT FIRST 8
                C.CLAVE, C.NOMBRE, C.NOMBRECOMERCIAL, C.RFC,
                C.TELEFONO, C.EMAILPRED, C.STATUS
            FROM {table} C
            WHERE COALESCE(C.STATUS, 'A') <> 'B'
              {filter.Sql}
            ORDER BY C.NOMBRE
            """;
        await using var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 20
        };
        AddTokenParameters(command, filter.Tokens, filter.ColumnCount);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<object>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new
            {
                customerCode = Text(reader, 0),
                name = Text(reader, 1),
                commercialName = Text(reader, 2),
                rfc = Text(reader, 3),
                phone = Text(reader, 4),
                email = Text(reader, 5),
                status = Text(reader, 6)
            });
        }
        return rows;
    }

    private static async Task<List<object>> ReadInvoicesAsync(
        FbConnection connection,
        string invoicesTable,
        string customersTable,
        IReadOnlyList<string> tokens,
        bool customerFocused,
        CancellationToken cancellationToken)
    {
        var filter = customerFocused
            ? BuildFilter(
                tokens, "F.CVE_CLPV", "C.NOMBRE",
                "C.NOMBRECOMERCIAL", "C.RFC")
            : BuildFilter(
                tokens, "F.CVE_DOC", "F.CVE_CLPV", "C.NOMBRE",
                "C.NOMBRECOMERCIAL", "C.RFC");
        var sql = $"""
            SELECT FIRST 10
                F.CVE_DOC, F.FECHA_DOC, F.CVE_CLPV,
                COALESCE(C.NOMBRECOMERCIAL, C.NOMBRE, F.CVE_CLPV),
                F.STATUS, F.FECHA_CANCELA, F.CVE_VEND, F.NUM_ALMA,
                COALESCE(F.CAN_TOT, 0) - COALESCE(F.DES_TOT, 0),
                COALESCE(F.IMPORTE, 0)
            FROM {invoicesTable} F
            LEFT JOIN {customersTable} C ON C.CLAVE = F.CVE_CLPV
            WHERE 1 = 1
              {filter.Sql}
            ORDER BY F.FECHA_DOC DESC, F.CVE_DOC DESC
            """;
        await using var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 20
        };
        AddTokenParameters(command, filter.Tokens, filter.ColumnCount);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<object>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new
            {
                invoiceNumber = Text(reader, 0),
                documentDate = Date(reader, 1),
                customerCode = Text(reader, 2),
                customer = Text(reader, 3),
                status = Text(reader, 4),
                cancellationDate = Date(reader, 5),
                sellerCode = Text(reader, 6),
                warehouseNumber = Integer(reader, 7),
                amountWithoutTax = Decimal(reader, 8),
                amountWithTax = Decimal(reader, 9),
                isCanceled = string.Equals(
                    Text(reader, 4), "C", StringComparison.OrdinalIgnoreCase)
            });
        }
        return rows;
    }

    private static async Task<List<object>> ReadInvoiceHeaderAsync(
        FbConnection connection,
        string invoicesTable,
        string customersTable,
        string? documentNumber,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
            return [];

        var sql = $"""
            SELECT FIRST 1
                F.CVE_DOC, F.FECHA_DOC, F.CVE_CLPV,
                COALESCE(C.NOMBRECOMERCIAL, C.NOMBRE, F.CVE_CLPV),
                F.STATUS, F.FECHA_CANCELA, F.CVE_VEND, F.NUM_ALMA,
                COALESCE(F.CAN_TOT, 0) - COALESCE(F.DES_TOT, 0),
                COALESCE(F.IMPORTE, 0)
            FROM {invoicesTable} F
            LEFT JOIN {customersTable} C ON C.CLAVE = F.CVE_CLPV
            WHERE UPPER(TRIM(F.CVE_DOC)) = UPPER(TRIM(@document))
            """;
        await using var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 20
        };
        command.Parameters.AddWithValue("@document", documentNumber);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<object>();
        if (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new
            {
                invoiceNumber = Text(reader, 0),
                documentDate = Date(reader, 1),
                customerCode = Text(reader, 2),
                customer = Text(reader, 3),
                status = Text(reader, 4),
                cancellationDate = Date(reader, 5),
                sellerCode = Text(reader, 6),
                warehouseNumber = Integer(reader, 7),
                amountWithoutTax = Decimal(reader, 8),
                amountWithTax = Decimal(reader, 9),
                isCanceled = string.Equals(
                    Text(reader, 4), "C", StringComparison.OrdinalIgnoreCase)
            });
        }
        return rows;
    }

    private static async Task<List<object>> ReadInvoiceItemsAsync(
        FbConnection connection,
        string table,
        string inventoryTable,
        string? documentNumber,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
            return [];

        var sql = $"""
            SELECT FIRST 40
                P.NUM_PAR, P.CVE_ART, COALESCE(P.DESCR_ART, I.DESCR),
                P.CANT, P.UNI_VENTA, P.PREC, P.PREC_NETO,
                COALESCE(P.CANT, 0) * COALESCE(P.PREC, 0) *
                (1 - COALESCE(P.DESC1, 0) / 100.0) *
                (1 - COALESCE(P.DESC2, 0) / 100.0) *
                (1 - COALESCE(P.DESC3, 0) / 100.0),
                COALESCE(P.TOTIMP1, 0) + COALESCE(P.TOTIMP2, 0) +
                COALESCE(P.TOTIMP3, 0) + COALESCE(P.TOTIMP4, 0) +
                COALESCE(P.TOTIMP5, 0) + COALESCE(P.TOTIMP6, 0) +
                COALESCE(P.TOTIMP7, 0) + COALESCE(P.TOTIMP8, 0),
                P.NUM_ALM
            FROM {table} P
            LEFT JOIN {inventoryTable} I ON I.CVE_ART = P.CVE_ART
            WHERE P.CVE_DOC = @document
            ORDER BY P.NUM_PAR
            """;
        await using var command = new FbCommand(sql, connection)
        {
            CommandTimeout = 20
        };
        command.Parameters.AddWithValue("@document", documentNumber);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<object>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var subtotal = Decimal(reader, 7);
            var tax = Decimal(reader, 8);
            rows.Add(new
            {
                lineNumber = Integer(reader, 0),
                productCode = Text(reader, 1),
                description = Text(reader, 2),
                quantity = Decimal(reader, 3),
                unit = Text(reader, 4),
                price = Decimal(reader, 5),
                netPrice = Decimal(reader, 6),
                subtotal,
                tax,
                totalWithTax = subtotal + tax,
                warehouseNumber = Integer(reader, 9)
            });
        }
        return rows;
    }

    private static (
        string Sql,
        IReadOnlyList<string> Tokens,
        int ColumnCount) BuildFilter(
        IReadOnlyList<string> tokens,
        params string[] columns)
    {
        if (tokens.Count == 0)
            return (string.Empty, tokens, columns.Length);

        var tokenClauses = tokens.Select((_, tokenIndex) =>
            "(" + string.Join(" OR ", columns.Select((column, columnIndex) =>
                $"UPPER(COALESCE({column}, '')) LIKE @term{tokenIndex}_{columnIndex}")) + ")");
        return (
            $"AND ({string.Join(" OR ", tokenClauses)})",
            tokens,
            columns.Length);
    }

    private static void AddTokenParameters(
        FbCommand command,
        IReadOnlyList<string> tokens,
        int columnCount)
    {
        for (var index = 0; index < tokens.Count; index++)
        {
            for (var columnIndex = 0; columnIndex < columnCount; columnIndex++)
            {
                command.Parameters.AddWithValue(
                    $"@term{index}_{columnIndex}",
                    $"%{tokens[index].ToUpperInvariant()}%");
            }
        }
    }

    private static string? Text(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetValue(ordinal).ToString()?.Trim();

    private static decimal Decimal(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? 0 : Convert.ToDecimal(reader.GetValue(ordinal));

    private static int Integer(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? 0 : Convert.ToInt32(reader.GetValue(ordinal));

    private static DateTime? Date(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : Convert.ToDateTime(reader.GetValue(ordinal));
}
