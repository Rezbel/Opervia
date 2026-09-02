namespace Opervia.Application.Inventory;

public sealed record SaeInventoryAnalyticsResult(
    bool IsSuccessful,
    string Message,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string? SellerCode,
    int? WarehouseNumber,
    string? ProductLine,
    int ActiveProductCount,
    int SellingProductCount,
    decimal InventoryValue,
    int LowStockCount,
    int OutOfStockSellingCount,
    decimal DormantStockValue,
    IReadOnlyList<SaeInventoryProductPerformance> Products,
    IReadOnlyList<SaeInventoryRiskProduct> Risks,
    IReadOnlyList<SaeInventoryBreakdownItem> Sellers,
    IReadOnlyList<SaeInventoryBreakdownItem> Warehouses,
    IReadOnlyList<SaeInventoryBreakdownItem> ProductLines,
    SaeInventoryFilterOptions FilterOptions,
    long ElapsedMilliseconds);

public sealed record SaeInventoryProductPerformance(
    string ProductCode,
    string Description,
    string? LineCode,
    string? LineName,
    string? Unit,
    decimal CurrentStock,
    decimal StockMinimum,
    decimal StockMaximum,
    decimal AverageCost,
    decimal StockValue,
    decimal QuantitySold,
    decimal SalesWithoutTax,
    decimal SalesWithTax,
    decimal CostOfSales,
    decimal GrossProfit,
    decimal GrossMarginPercent,
    int InvoiceCount,
    DateTime? LastSaleDate,
    decimal MonthlyVelocity,
    decimal? CoverageDays);

public sealed record SaeInventoryRiskProduct(
    string RiskType,
    string Severity,
    string ProductCode,
    string Description,
    string? LineName,
    decimal CurrentStock,
    decimal ReferenceStock,
    decimal StockValue,
    decimal QuantitySold,
    int? DaysSinceLastSale);

public sealed record SaeInventoryBreakdownItem(
    string Key,
    string Label,
    decimal SalesWithoutTax,
    decimal SalesWithTax,
    decimal GrossProfit,
    decimal QuantitySold,
    decimal StockValue,
    int ProductCount);

public sealed record SaeInventoryFilterOptions(
    IReadOnlyList<SaeInventoryFilterOption> Sellers,
    IReadOnlyList<SaeInventoryFilterOption> Warehouses,
    IReadOnlyList<SaeInventoryFilterOption> ProductLines);

public sealed record SaeInventoryFilterOption(
    string Value,
    string Label);
