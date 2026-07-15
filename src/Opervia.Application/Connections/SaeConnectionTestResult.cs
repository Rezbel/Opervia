namespace Opervia.Application.Connections;

public sealed record SaeConnectionTestResult(
    bool IsSuccessful,
    string Message,
    string? ServerVersion,
    long ElapsedMilliseconds
);
