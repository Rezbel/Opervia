namespace Opervia.Application.Schema;

public sealed record SaeTableStatus(
    string LogicalName,
    string PhysicalName,
    bool Exists
);
