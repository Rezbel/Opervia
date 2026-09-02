namespace Opervia.Application.Receivables;

public sealed record SaeReceivableRootResult(
    bool IsSuccessful,
    string Message,
    string TableName,
    string DocumentNumber,
    SaeReceivableRoot? Root,
    long ElapsedMilliseconds
);
