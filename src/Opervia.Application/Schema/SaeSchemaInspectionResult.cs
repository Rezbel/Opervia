namespace Opervia.Application.Schema;

public sealed record SaeSchemaInspectionResult(
    bool IsSuccessful,
    string Message,
    string? ServerVersion,
    int TotalUserTables,
    int CompanyTablesCount,
    IReadOnlyList<SaeTableStatus> ExpectedTables,
    IReadOnlyList<string> CompanyTables,
    long ElapsedMilliseconds
);
