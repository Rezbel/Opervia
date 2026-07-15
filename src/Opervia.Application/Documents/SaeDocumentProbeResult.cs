namespace Opervia.Application.Documents;

public sealed record SaeDocumentProbeResult(
    bool IsSuccessful,
    string Message,
    string TableName,
    IReadOnlyList<SaeDocumentHeader> Documents,
    long ElapsedMilliseconds
);
