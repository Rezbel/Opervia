namespace Opervia.Application.Receivables;

public sealed record SaeCustomerReceivableMovementsResult(
    bool IsSuccessful,
    string Message,
    string MovementsTableName,
    string ConceptsTableName,
    string CustomerCode,
    IReadOnlyList<SaeReceivableMovement> Movements,
    long ElapsedMilliseconds
);
