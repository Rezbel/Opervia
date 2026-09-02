namespace Opervia.Application.DocumentItems;

public sealed record SaeDocumentItemsResult(
    bool IsSuccessful,
    string Message,
    string TableName,
    string DocumentNumber,
    IReadOnlyList<SaeDocumentItem> Items,
    decimal TotalQuantity,
    decimal TotalAmount,
    decimal TotalAmountWithTax,
    bool IsTruncated,
    long ElapsedMilliseconds
);
