namespace Opervia.Application.Customers;

public sealed record SaeCustomerLookupResult(
    bool IsSuccessful,
    string Message,
    string TableName,
    SaeCustomer? Customer,
    long ElapsedMilliseconds
);
