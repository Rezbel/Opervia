namespace Opervia.Application.Customers;

public sealed record SaeCustomerPortfolioFilter(
    string? SellerCode,
    string? BranchCode,
    string? StateCode,
    string? CustomerTypeCode,
    string? ClassificationCode,
    string? CreditCode,
    string? SelectedCustomerCode
);

public sealed record SaeCustomerPortfolioResult(
    bool IsSuccessful,
    string Message,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    IReadOnlyList<SaeCustomerPortfolioRow> Customers,
    IReadOnlyList<SaeCustomerPeriodInvoice> Invoices,
    long ElapsedMilliseconds,
    decimal? PendingInvoiceBalance = null,
    decimal? CreditBalance = null,
    decimal? OtherAccountBalance = null,
    decimal? AccountingBalance = null,
    decimal? BalanceDifference = null,
    IReadOnlyList<SaeCustomerPendingCharge>? PendingCharges = null
);

public sealed record SaeCustomerPendingCharge(DateTime? DueDate, decimal Amount);

public sealed record SaeCustomerPortfolioRow(
    string CustomerCode,
    string CustomerName,
    string? SellerCode,
    string CustomerStatus,
    string Classification,
    bool HasCredit,
    decimal CreditLimit,
    int CreditDays,
    decimal Balance,
    string RawCustomerCode
);

public sealed record SaeCustomerPeriodInvoice(
    string InvoiceNumber,
    DateTime DocumentDate,
    DateTime? DueDate,
    string? SellerCode,
    decimal Amount,
    string Status,
    decimal OriginalAmount
);
