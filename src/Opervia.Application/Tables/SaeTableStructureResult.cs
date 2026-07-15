namespace Opervia.Application.Tables;

public sealed record SaeTableStructureResult(
    bool IsSuccessful,
    string Message,
    string TableName,
    IReadOnlyList<SaeColumnDefinition> Columns,
    long ElapsedMilliseconds
);
