using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Inventory;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeInventoryAnalyticsProbe(
    ILogger<FirebirdSaeInventoryAnalyticsProbe> logger
) : ISaeInventoryAnalyticsProbe
{
    private const string NetSaleExpression = """
        COALESCE(P.CANT, 0) * COALESCE(P.PREC, 0)
        * (1 - COALESCE(P.DESC1, 0) / 100.0)
        * (1 - COALESCE(P.DESC2, 0) / 100.0)
        * (1 - COALESCE(P.DESC3, 0) / 100.0)
        """;
    private const string TaxExpression = """
        COALESCE(P.TOTIMP1, 0) + COALESCE(P.TOTIMP2, 0) +
        COALESCE(P.TOTIMP3, 0) + COALESCE(P.TOTIMP4, 0) +
        COALESCE(P.TOTIMP5, 0) + COALESCE(P.TOTIMP6, 0) +
        COALESCE(P.TOTIMP7, 0) + COALESCE(P.TOTIMP8, 0)
        """;

    public async Task<SaeInventoryAnalyticsResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly from,
        DateOnly to,
        string? sellerCode,
        int? warehouseNumber,
        string? productLine,
        CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var inventoryTable = profile.ResolveTableName("INVE");
        var multiWarehouseTable = profile.ResolveTableName("MULT");
        var invoiceTable = profile.ResolveTableName("FACTF");
        var invoiceLinesTable = profile.ResolveTableName("PAR_FACTF");
        var sellersTable = profile.ResolveTableName("VEND");
        var warehousesTable = profile.ResolveTableName("ALMACENES");
        var productLinesTable = profile.ResolveTableName("CLIN");

        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(cancellationToken);
            var products = await ReadProductsAsync(
                connection, inventoryTable, multiWarehouseTable, invoiceTable,
                invoiceLinesTable, productLinesTable, from, to, sellerCode,
                warehouseNumber, productLine, cancellationToken);
            var sellers = await ReadSellerBreakdownAsync(
                connection, inventoryTable, invoiceTable, invoiceLinesTable, sellersTable,
                from, to, sellerCode, warehouseNumber, productLine, cancellationToken);
            var warehouses = await ReadWarehouseBreakdownAsync(
                connection, inventoryTable, multiWarehouseTable, invoiceTable,
                invoiceLinesTable, warehousesTable, from, to, sellerCode,
                warehouseNumber, productLine, cancellationToken);
            var filterOptions = await ReadFilterOptionsAsync(
                connection, sellersTable, warehousesTable, productLinesTable,
                cancellationToken);

            var activeProductCount = products.Count;
            var sellingProducts = products.Where(item => item.QuantitySold > 0).ToArray();
            var inventoryValue = products.Sum(item => item.StockValue);
            var lowStockCount = products.Count(item =>
                item.CurrentStock > 0 && item.StockMinimum > 0 && item.CurrentStock <= item.StockMinimum);
            var outOfStockSellingCount = products.Count(item =>
                item.CurrentStock <= 0 && item.QuantitySold > 0);
            var dormantStockValue = products
                .Where(IsDormant)
                .Sum(item => item.StockValue);
            var risks = BuildRisks(products);
            var productLines = products
                .GroupBy(item => new
                {
                    Key = string.IsNullOrWhiteSpace(item.LineCode) ? "SIN LINEA" : item.LineCode,
                    Label = string.IsNullOrWhiteSpace(item.LineName)
                        ? (string.IsNullOrWhiteSpace(item.LineCode) ? "Sin línea" : item.LineCode)
                        : item.LineName
                })
                .Select(group => new SaeInventoryBreakdownItem(
                    group.Key.Key!, group.Key.Label!,
                    group.Sum(item => item.SalesWithoutTax),
                    group.Sum(item => item.SalesWithTax),
                    group.Sum(item => item.GrossProfit),
                    group.Sum(item => item.QuantitySold),
                    group.Sum(item => item.StockValue),
                    group.Count()))
                .OrderByDescending(item => item.GrossProfit)
                .ToArray();

            var responseProducts = sellingProducts
                .OrderByDescending(item => item.GrossProfit).Take(100)
                .Concat(sellingProducts.OrderByDescending(item => item.SalesWithoutTax).Take(100))
                .Concat(sellingProducts.OrderByDescending(item => item.QuantitySold).Take(100))
                .Concat(sellingProducts.Where(item => item.SalesWithoutTax >= 1000)
                    .OrderByDescending(item => item.GrossMarginPercent).Take(100))
                .DistinctBy(item => item.ProductCode, StringComparer.OrdinalIgnoreCase)
                .Take(300)
                .ToArray();

            stopwatch.Stop();
            return new SaeInventoryAnalyticsResult(
                true,
                "Inventario y desempeño de productos calculados exclusivamente con SAE.",
                from, to, sellerCode, warehouseNumber, productLine,
                activeProductCount,
                sellingProducts.Length,
                inventoryValue,
                lowStockCount,
                outOfStockSellingCount,
                dormantStockValue,
                responseProducts,
                risks,
                sellers,
                warehouses,
                productLines,
                filterOptions,
                stopwatch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();
            return Failure("La consulta fue cancelada.", from, to, sellerCode,
                warehouseNumber, productLine, stopwatch.ElapsedMilliseconds);
        }
        catch (Exception exception)
        {
            stopwatch.Stop();
            logger.LogError(exception, "Falló el análisis de inventario SAE en modo de solo lectura.");
            return Failure("No fue posible analizar el inventario de SAE.", from, to,
                sellerCode, warehouseNumber, productLine, stopwatch.ElapsedMilliseconds);
        }
    }

    private static async Task<IReadOnlyList<SaeInventoryProductPerformance>> ReadProductsAsync(
        FbConnection connection,
        string inventoryTable,
        string multiWarehouseTable,
        string invoiceTable,
        string invoiceLinesTable,
        string productLinesTable,
        DateOnly from,
        DateOnly to,
        string? seller,
        int? warehouse,
        string? productLine,
        CancellationToken cancellationToken)
    {
        var stockExpression = warehouse.HasValue ? "COALESCE(M.EXIST, 0)" : "COALESCE(I.EXIST, 0)";
        var warehouseJoin = warehouse.HasValue
            ? $"LEFT JOIN {multiWarehouseTable} M ON M.CVE_ART = I.CVE_ART AND M.CVE_ALM = @warehouse"
            : string.Empty;
        var filters = BuildSalesFilters(seller, warehouse, productLine);
        var lineFilter = string.IsNullOrWhiteSpace(productLine)
            ? string.Empty
            : "AND TRIM(I.LIN_PROD) = @line";
        var sql = $"""
            SELECT
                I.CVE_ART,
                I.DESCR,
                I.LIN_PROD,
                L.DESC_LIN,
                I.UNI_MED,
                {stockExpression},
                COALESCE(I.STOCK_MIN, 0),
                COALESCE(I.STOCK_MAX, 0),
                COALESCE(I.COSTO_PROM, 0),
                I.FCH_ULTVTA,
                COALESCE(S.QUANTITY_SOLD, 0),
                COALESCE(S.SALES_WITHOUT_TAX, 0),
                COALESCE(S.SALES_WITH_TAX, 0),
                COALESCE(S.COST_OF_SALES, 0),
                COALESCE(S.INVOICE_COUNT, 0)
            FROM {inventoryTable} I
            LEFT JOIN {productLinesTable} L ON L.CVE_LIN = I.LIN_PROD
            {warehouseJoin}
            LEFT JOIN (
                SELECT
                    P.CVE_ART,
                    SUM(COALESCE(P.CANT, 0)) AS QUANTITY_SOLD,
                    SUM({NetSaleExpression}) AS SALES_WITHOUT_TAX,
                    SUM(({NetSaleExpression}) + ({TaxExpression})) AS SALES_WITH_TAX,
                    SUM(COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)) AS COST_OF_SALES,
                    COUNT(DISTINCT F.CVE_DOC) AS INVOICE_COUNT
                FROM {invoiceTable} F
                INNER JOIN {invoiceLinesTable} P ON P.CVE_DOC = F.CVE_DOC
                INNER JOIN {inventoryTable} SI ON SI.CVE_ART = P.CVE_ART
                WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
                  AND COALESCE(F.STATUS, '') <> 'C'
                  AND P.CVE_ART IS NOT NULL
                  {filters}
                GROUP BY P.CVE_ART
            ) S ON S.CVE_ART = I.CVE_ART
            WHERE COALESCE(I.STATUS, 'A') <> 'B'
              AND COALESCE(I.TIPO_ELE, 'P') <> 'S'
              {lineFilter}
            """;

        await using var command = new FbCommand(sql, connection) { CommandTimeout = 60 };
        AddParameters(command, from, to, seller, warehouse, productLine);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var periodDays = Math.Max(1, to.DayNumber - from.DayNumber + 1);
        var result = new List<SaeInventoryProductPerformance>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var stock = Decimal(reader, 5);
            var averageCost = Decimal(reader, 8);
            var quantity = Decimal(reader, 10);
            var sales = Decimal(reader, 11);
            var cost = Decimal(reader, 13);
            var profit = sales - cost;
            var velocity = quantity * 30m / periodDays;
            var coverageDays = quantity > 0 && stock > 0
                ? Math.Round(stock / (quantity / periodDays), 1)
                : (decimal?)null;
            result.Add(new SaeInventoryProductPerformance(
                Text(reader, 0), Text(reader, 1), NullableText(reader, 2),
                NullableText(reader, 3), NullableText(reader, 4),
                stock, Decimal(reader, 6), Decimal(reader, 7), averageCost,
                Math.Max(stock, 0) * averageCost,
                quantity, sales, Decimal(reader, 12), cost, profit,
                sales == 0 ? 0 : Math.Round(profit * 100m / sales, 1),
                Integer(reader, 14), NullableDate(reader, 9),
                Math.Round(velocity, 2), coverageDays));
        }

        return result;
    }

    private static async Task<IReadOnlyList<SaeInventoryBreakdownItem>> ReadSellerBreakdownAsync(
        FbConnection connection,
        string inventoryTable,
        string invoiceTable,
        string invoiceLinesTable,
        string sellersTable,
        DateOnly from,
        DateOnly to,
        string? seller,
        int? warehouse,
        string? productLine,
        CancellationToken cancellationToken)
    {
        var filters = BuildSalesFilters(seller, warehouse, productLine);
        var sql = $"""
            SELECT
                COALESCE(NULLIF(TRIM(F.CVE_VEND), ''), 'SIN VENDEDOR'),
                COALESCE(NULLIF(TRIM(V.NOMBRE), ''), NULLIF(TRIM(F.CVE_VEND), ''), 'Sin vendedor'),
                SUM({NetSaleExpression}),
                SUM(({NetSaleExpression}) + ({TaxExpression})),
                SUM(({NetSaleExpression}) - COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)),
                SUM(COALESCE(P.CANT, 0)),
                0,
                COUNT(DISTINCT P.CVE_ART)
            FROM {invoiceTable} F
            INNER JOIN {invoiceLinesTable} P ON P.CVE_DOC = F.CVE_DOC
            INNER JOIN {inventoryTable} SI ON SI.CVE_ART = P.CVE_ART
            LEFT JOIN {sellersTable} V ON V.CVE_VEND = F.CVE_VEND
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              AND P.CVE_ART IS NOT NULL
              {filters}
            GROUP BY 1, 2
            ORDER BY 5 DESC
            """;
        await using var command = new FbCommand(sql, connection) { CommandTimeout = 45 };
        AddParameters(command, from, to, seller, warehouse, productLine);
        return await ReadBreakdownAsync(command, cancellationToken);
    }

    private static async Task<IReadOnlyList<SaeInventoryBreakdownItem>> ReadWarehouseBreakdownAsync(
        FbConnection connection,
        string inventoryTable,
        string multiWarehouseTable,
        string invoiceTable,
        string invoiceLinesTable,
        string warehousesTable,
        DateOnly from,
        DateOnly to,
        string? seller,
        int? warehouse,
        string? productLine,
        CancellationToken cancellationToken)
    {
        var lineFilter = string.IsNullOrWhiteSpace(productLine)
            ? string.Empty
            : "AND TRIM(I.LIN_PROD) = @line";
        var warehouseFilter = warehouse.HasValue
            ? "AND A.CVE_ALM = @warehouse"
            : string.Empty;
        var sql = $"""
            SELECT
                CAST(A.CVE_ALM AS VARCHAR(12)),
                COALESCE(NULLIF(TRIM(A.DESCR), ''), 'Almacén ' || CAST(A.CVE_ALM AS VARCHAR(12))),
                0, 0, 0, 0,
                SUM(CASE WHEN COALESCE(M.EXIST, 0) > 0
                    THEN COALESCE(M.EXIST, 0) * COALESCE(I.COSTO_PROM, 0) ELSE 0 END),
                COUNT(DISTINCT CASE WHEN COALESCE(M.EXIST, 0) <> 0 THEN M.CVE_ART END)
            FROM {warehousesTable} A
            LEFT JOIN {multiWarehouseTable} M ON M.CVE_ALM = A.CVE_ALM
            LEFT JOIN {inventoryTable} I ON I.CVE_ART = M.CVE_ART
            WHERE COALESCE(A.STATUS, 'A') <> 'B'
              {lineFilter}
              {warehouseFilter}
            GROUP BY A.CVE_ALM, A.DESCR
            ORDER BY A.CVE_ALM
            """;
        await using var command = new FbCommand(sql, connection) { CommandTimeout = 45 };
        AddParameters(command, from, to, null, warehouse, productLine);
        var current = (await ReadBreakdownAsync(command, cancellationToken))
            .ToDictionary(item => item.Key, StringComparer.OrdinalIgnoreCase);

        var salesFilters = BuildSalesFilters(seller, warehouse, productLine);
        var salesSql = $"""
            SELECT
                CAST(COALESCE(P.NUM_ALM, F.NUM_ALMA, 0) AS VARCHAR(12)),
                COALESCE(NULLIF(TRIM(A.DESCR), ''), 'Almacén ' || CAST(COALESCE(P.NUM_ALM, F.NUM_ALMA, 0) AS VARCHAR(12))),
                SUM({NetSaleExpression}),
                SUM(({NetSaleExpression}) + ({TaxExpression})),
                SUM(({NetSaleExpression}) - COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)),
                SUM(COALESCE(P.CANT, 0)),
                0,
                COUNT(DISTINCT P.CVE_ART)
            FROM {invoiceTable} F
            INNER JOIN {invoiceLinesTable} P ON P.CVE_DOC = F.CVE_DOC
            INNER JOIN {inventoryTable} SI ON SI.CVE_ART = P.CVE_ART
            LEFT JOIN {warehousesTable} A ON A.CVE_ALM = COALESCE(P.NUM_ALM, F.NUM_ALMA, 0)
            WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
              AND COALESCE(F.STATUS, '') <> 'C'
              AND P.CVE_ART IS NOT NULL
              {salesFilters}
            GROUP BY 1, 2
            """;
        await using var salesCommand = new FbCommand(salesSql, connection) { CommandTimeout = 45 };
        AddParameters(salesCommand, from, to, seller, warehouse, productLine);
        var sales = await ReadBreakdownAsync(salesCommand, cancellationToken);
        foreach (var item in sales)
        {
            current[item.Key] = current.TryGetValue(item.Key, out var stock)
                ? item with { StockValue = stock.StockValue, ProductCount = Math.Max(item.ProductCount, stock.ProductCount) }
                : item;
        }

        return current.Values.OrderByDescending(item => item.GrossProfit).ToArray();
    }

    private static async Task<IReadOnlyList<SaeInventoryBreakdownItem>> ReadBreakdownAsync(
        FbCommand command,
        CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new List<SaeInventoryBreakdownItem>();
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new SaeInventoryBreakdownItem(
                Text(reader, 0), Text(reader, 1), Decimal(reader, 2), Decimal(reader, 3),
                Decimal(reader, 4), Decimal(reader, 5), Decimal(reader, 6), Integer(reader, 7)));
        }
        return result;
    }

    private static async Task<SaeInventoryFilterOptions> ReadFilterOptionsAsync(
        FbConnection connection,
        string sellersTable,
        string warehousesTable,
        string productLinesTable,
        CancellationToken cancellationToken)
    {
        var sellers = await ReadOptionsAsync(connection,
            $"SELECT TRIM(CVE_VEND), COALESCE(NULLIF(TRIM(NOMBRE), ''), TRIM(CVE_VEND)) FROM {sellersTable} WHERE COALESCE(STATUS, 'A') <> 'B' ORDER BY 2",
            cancellationToken);
        var warehouses = await ReadOptionsAsync(connection,
            $"SELECT CAST(CVE_ALM AS VARCHAR(12)), COALESCE(NULLIF(TRIM(DESCR), ''), 'Almacén ' || CAST(CVE_ALM AS VARCHAR(12))) FROM {warehousesTable} WHERE COALESCE(STATUS, 'A') <> 'B' ORDER BY CVE_ALM",
            cancellationToken);
        var lines = await ReadOptionsAsync(connection,
            $"SELECT TRIM(CVE_LIN), COALESCE(NULLIF(TRIM(DESC_LIN), ''), TRIM(CVE_LIN)) FROM {productLinesTable} WHERE COALESCE(STATUS, 'A') <> 'B' ORDER BY 2",
            cancellationToken);
        return new SaeInventoryFilterOptions(sellers, warehouses, lines);
    }

    private static async Task<IReadOnlyList<SaeInventoryFilterOption>> ReadOptionsAsync(
        FbConnection connection,
        string sql,
        CancellationToken cancellationToken)
    {
        await using var command = new FbCommand(sql, connection) { CommandTimeout = 20 };
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new List<SaeInventoryFilterOption>();
        while (await reader.ReadAsync(cancellationToken))
            result.Add(new SaeInventoryFilterOption(Text(reader, 0), Text(reader, 1)));
        return result;
    }

    private static IReadOnlyList<SaeInventoryRiskProduct> BuildRisks(
        IReadOnlyList<SaeInventoryProductPerformance> products)
    {
        var today = DateTime.Today;
        return products.Select(product =>
        {
            var days = product.LastSaleDate.HasValue
                ? Math.Max(0, (today - product.LastSaleDate.Value.Date).Days)
                : (int?)null;
            if (product.CurrentStock <= 0 && product.QuantitySold > 0)
                return Risk("OutOfStock", "Critical", product, 0, days);
            if (product.CurrentStock > 0 && product.StockMinimum > 0
                && product.CurrentStock <= product.StockMinimum)
                return Risk("LowStock", "High", product, product.StockMinimum, days);
            if (product.StockMaximum > 0 && product.CurrentStock > product.StockMaximum)
                return Risk("Overstock", "Medium", product, product.StockMaximum, days);
            if (IsDormant(product))
                return Risk("Dormant", "Medium", product, 90, days);
            return null;
        })
        .Where(item => item is not null)
        .Select(item => item!)
        .OrderBy(item => item.Severity switch { "Critical" => 0, "High" => 1, _ => 2 })
        .ThenByDescending(item => item.StockValue)
        .Take(30)
        .ToArray();
    }

    private static SaeInventoryRiskProduct Risk(
        string type,
        string severity,
        SaeInventoryProductPerformance product,
        decimal reference,
        int? days) =>
        new(type, severity, product.ProductCode, product.Description,
            product.LineName, product.CurrentStock, reference, product.StockValue,
            product.QuantitySold, days);

    private static bool IsDormant(SaeInventoryProductPerformance item) =>
        item.CurrentStock > 0 && item.StockValue > 0
        && (!item.LastSaleDate.HasValue || item.LastSaleDate.Value.Date <= DateTime.Today.AddDays(-90));

    private static string BuildSalesFilters(string? seller, int? warehouse, string? productLine)
    {
        var filters = new List<string>();
        if (!string.IsNullOrWhiteSpace(seller)) filters.Add("AND TRIM(F.CVE_VEND) = @seller");
        if (warehouse.HasValue) filters.Add("AND COALESCE(P.NUM_ALM, F.NUM_ALMA, 0) = @warehouse");
        if (!string.IsNullOrWhiteSpace(productLine)) filters.Add("AND TRIM(SI.LIN_PROD) = @line");
        return string.Join(Environment.NewLine, filters);
    }

    private static void AddParameters(
        FbCommand command,
        DateOnly from,
        DateOnly to,
        string? seller,
        int? warehouse,
        string? productLine)
    {
        if (command.CommandText.Contains("@from", StringComparison.Ordinal))
            command.Parameters.AddWithValue("@from", from.ToDateTime(TimeOnly.MinValue));
        if (command.CommandText.Contains("@to", StringComparison.Ordinal))
            command.Parameters.AddWithValue("@to", to.AddDays(1).ToDateTime(TimeOnly.MinValue));
        if (!string.IsNullOrWhiteSpace(seller) && command.CommandText.Contains("@seller", StringComparison.Ordinal))
            command.Parameters.AddWithValue("@seller", seller);
        if (warehouse.HasValue && command.CommandText.Contains("@warehouse", StringComparison.Ordinal))
            command.Parameters.AddWithValue("@warehouse", warehouse.Value);
        if (!string.IsNullOrWhiteSpace(productLine) && command.CommandText.Contains("@line", StringComparison.Ordinal))
            command.Parameters.AddWithValue("@line", productLine);
    }

    private static decimal Decimal(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? 0 : Convert.ToDecimal(reader.GetValue(ordinal));
    private static int Integer(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? 0 : Convert.ToInt32(reader.GetValue(ordinal));
    private static string Text(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? string.Empty : reader.GetString(ordinal).Trim();
    private static string? NullableText(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal).Trim();
    private static DateTime? NullableDate(FbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal);

    private static SaeInventoryAnalyticsResult Failure(
        string message, DateOnly from, DateOnly to, string? seller,
        int? warehouse, string? line, long elapsedMilliseconds) =>
        new(false, message, from, to, seller, warehouse, line,
            0, 0, 0, 0, 0, 0, [], [], [], [], [],
            new([], [], []), elapsedMilliseconds);
}
