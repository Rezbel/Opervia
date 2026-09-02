namespace Opervia.Application.Flows;

public sealed record SaeSalesFlowSummaryResult(
    bool IsSuccessful,
    string Message,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string? SellerCode,
    IReadOnlyList<SaeSalesFlowStageMetric> Stages,
    IReadOnlyList<SaeSalesFlowTransitionMetric> Transitions,
    IReadOnlyList<SaeSalesFlowBottleneck> Bottlenecks,
    IReadOnlyList<SaeSalesFlowSellerOption> SellerOptions,
    int SkippedStageCount,
    int BrokenLinkCount,
    int RecentQuotationWithoutOrderCount,
    IReadOnlyList<SaeSalesFlowDocumentListItem> Documents,
    long ElapsedMilliseconds
);

public sealed record SaeSalesFlowDocumentListItem(
    string Kind,
    string StageLabel,
    string DocumentNumber,
    string CustomerCode,
    string? SellerCode,
    DateTime DocumentDate,
    bool IsCancelled,
    decimal AmountBeforeTax,
    decimal AmountWithTax
);

public sealed record SaeSalesFlowStageMetric(
    string Kind,
    string Label,
    int DocumentCount,
    int ActiveCount,
    int CancelledCount,
    decimal ActiveAmountBeforeTax,
    decimal ActiveAmountWithTax
);

public sealed record SaeSalesFlowTransitionMetric(
    string FromKind,
    string ToKind,
    string Label,
    int ConsideredCount,
    int ProgressedCount,
    decimal ConversionRatePercent,
    decimal? AverageDays
);

public sealed record SaeSalesFlowBottleneck(
    string Kind,
    string StageLabel,
    string ExpectedNextStage,
    string DocumentNumber,
    string CustomerCode,
    string? SellerCode,
    DateTime DocumentDate,
    int WaitingDays,
    decimal AmountBeforeTax,
    decimal AmountWithTax
);

public sealed record SaeSalesFlowSellerOption(
    string Value,
    string Label,
    int DocumentCount
);
