namespace Opervia.Application.Receivables;

public sealed record SaeReceivablesSummaryResult(
    bool IsSuccessful,
    string Message,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    SaeReceivablesSummaryFilter AppliedFilters,
    SaeReceivablesFilterOptions FilterOptions,
    decimal GrossInvoicedAmount,
    decimal NetInvoicedAmount,
    int InvoiceCount,
    int NetInvoiceCount,
    decimal VoidedInvoiceAmount,
    int VoidedInvoiceCount,
    decimal CanceledInPeriodAmount,
    int CanceledInPeriodCount,
    decimal RealIncomeAmount,
    int RealPaymentCount,
    decimal ReturnsAndCreditsAmount,
    int ReturnAndCreditCount,
    decimal AppliedAdvanceAmount,
    int AppliedAdvanceCount,
    decimal OtherReductionAmount,
    int OtherReductionCount,
    IReadOnlyList<SaeReceivableConceptTotal> IncomeBreakdown,
    IReadOnlyList<SaeReceivableConceptTotal> NonCashBreakdown,
    IReadOnlyList<SaeReceivablesDailyPoint> DailySeries,
    IReadOnlyList<SaeReceivableRecentMovement> RecentPayments,
    IReadOnlyList<SaeReceivableRecentCancellation> RecentCancellations,
    IReadOnlyList<SaeReceivableInvoiceRow> Invoices,
    int InvoicePage,
    int InvoicePageSize,
    int TotalInvoiceCount,
    int FutureDatedReductionCount,
    decimal GrossInvoicedAmountWithoutTax,
    decimal NetInvoicedAmountWithoutTax,
    decimal VoidedInvoiceAmountWithoutTax,
    decimal CanceledInPeriodAmountWithoutTax,
    string InvoiceTableName,
    string MovementsTableName,
    string ConceptsTableName,
    long ElapsedMilliseconds
);

public sealed record SaeReceivablesFilterOptions(
    IReadOnlyList<SaeReceivableFilterOption> Sellers,
    IReadOnlyList<SaeReceivableFilterOption> Series,
    IReadOnlyList<SaeReceivableFilterOption> Warehouses,
    IReadOnlyList<SaeReceivableFilterOption> InvoiceStatuses,
    IReadOnlyList<SaeReceivableFilterOption> FiscalPaymentMethods,
    IReadOnlyList<SaeReceivableFilterOption> PaymentConcepts
);

public sealed record SaeReceivableFilterOption(
    string Value,
    string Label,
    int RecordCount,
    decimal Amount,
    decimal AmountWithoutTax,
    int ActiveRecordCount = 0,
    decimal ActiveAmount = 0,
    decimal ActiveAmountWithoutTax = 0
);

public sealed record SaeReceivableConceptTotal(
    int ConceptNumber,
    string Description,
    string Classification,
    decimal Amount,
    int MovementCount
);

public sealed record SaeReceivablesDailyPoint(
    DateOnly Date,
    decimal NetInvoicedAmount,
    decimal RealIncomeAmount,
    decimal NetInvoicedAmountWithoutTax
);

public sealed record SaeReceivableRecentMovement(
    string CustomerCode,
    string? InvoiceNumber,
    string? Document,
    int ConceptNumber,
    string Description,
    decimal Amount,
    DateTime ApplicationDate
);

public sealed record SaeReceivableRecentCancellation(
    string InvoiceNumber,
    string CustomerCode,
    decimal Amount,
    DateTime DocumentDate,
    DateTime CancellationDate
);

public sealed record SaeReceivableInvoiceRow(
    string InvoiceNumber,
    string CustomerCode,
    string CustomerName,
    string? SellerCode,
    DateTime? DueDate,
    string Status,
    DateTime? CreationDate = null
);
