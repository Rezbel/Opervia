namespace Opervia.Application.Profitability;

public sealed record ProfitabilityDashboardResult(
    bool IsSuccessful,
    string Message,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string? Branch,
    string? SellerCode,
    decimal NetSalesWithoutTax,
    decimal NetSalesWithTax,
    decimal CostOfSales,
    decimal PurchasesWithoutTax,
    decimal PurchasesWithTax,
    int PurchaseCount,
    decimal GrossProfit,
    decimal GrossMarginPercent,
    int InvoiceCount,
    decimal AverageTicket,
    IReadOnlyList<ProfitabilityPeriodPoint> Monthly,
    IReadOnlyList<ProfitabilityBreakdownItem> Branches,
    IReadOnlyList<ProfitabilityBreakdownItem> Sellers,
    IReadOnlyList<ProfitabilityFilterOption> BranchOptions,
    IReadOnlyList<ProfitabilityFilterOption> SellerOptions,
    ProfitabilitySourceInfo Sources,
    IReadOnlyList<string> Warnings,
    long ElapsedMilliseconds
);

public sealed record ProfitabilitySourceInfo(
    string SaeMode,
    string SaeInvoiceTable,
    string SaeLinesTable,
    string SaePurchaseTable
);
