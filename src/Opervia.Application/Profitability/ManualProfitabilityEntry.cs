namespace Opervia.Application.Profitability;

public sealed record ManualProfitabilityEntry(
    Guid Id,
    DateOnly EntryDate,
    string Category,
    string? Branch,
    decimal Amount,
    string? Note,
    DateTime CreatedAtUtc
);

public sealed record CreateManualProfitabilityEntry(
    DateOnly EntryDate,
    string Category,
    string? Branch,
    decimal Amount,
    string? Note
);
