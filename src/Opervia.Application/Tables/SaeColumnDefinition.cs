namespace Opervia.Application.Tables;

public sealed record SaeColumnDefinition(
    int Position,
    string Name,
    string DataType,
    int Length,
    int Scale,
    bool IsNullable
);
