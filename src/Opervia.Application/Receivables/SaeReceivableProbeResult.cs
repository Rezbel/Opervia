namespace Opervia.Application.Receivables;

public sealed record SaeReceivableProbeResult(
    bool IsSuccessful,
    string Message,
    string MovementsTableName,
    string ConceptsTableName,
    string DocumentNumber,
    IReadOnlyList<SaeReceivableMovement> Movements,
    long ElapsedMilliseconds
);
