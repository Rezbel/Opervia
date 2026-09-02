namespace Opervia.Application.Customers;

public sealed record SaeCustomer(
    string Code,
    string? Name,
    string? CommercialName,
    string? Rfc,
    string? Phone,
    string? Email
);
