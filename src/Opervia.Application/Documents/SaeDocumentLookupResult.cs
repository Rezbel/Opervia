namespace Opervia.Application.Documents;

public sealed record SaeDocumentLookupResult(
    bool IsSuccessful,
    string Message,
    string TableName,
    SaeDocumentHeader? Document,
    long ElapsedMilliseconds
);
