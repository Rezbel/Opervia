namespace Opervia.Application.Profitability;

public sealed record SaeProfitabilityResult(
    decimal NetSalesWithoutTax,
    decimal NetSalesWithTax,
    decimal CostOfSales,
    decimal PurchasesWithoutTax,
    decimal PurchasesWithTax,
    int PurchaseCount,
    int InvoiceCount,
    IReadOnlyList<ProfitabilityPeriodPoint> Monthly,
    IReadOnlyList<ProfitabilityBreakdownItem> Branches,
    IReadOnlyList<ProfitabilityBreakdownItem> Sellers,
    IReadOnlyList<ProfitabilityFilterOption> BranchOptions,
    IReadOnlyList<ProfitabilityFilterOption> SellerOptions,
    string InvoiceTableName,
    string InvoiceLinesTableName,
    string PurchaseTableName,
    long ElapsedMilliseconds
);

public sealed record ProfitabilityPeriodPoint(
    int Year,
    int Month,
    decimal NetSales,
    decimal NetSalesWithTax,
    decimal CostOfSales,
    int InvoiceCount
);

public sealed record ProfitabilityBreakdownItem(
    string Key,
    string Label,
    decimal NetSales,
    decimal NetSalesWithTax,
    decimal CostOfSales,
    int InvoiceCount
);

public sealed record ProfitabilityFilterOption(
    string Value,
    string Label
);
