namespace Opervia.Application.DocumentItems;

public sealed record SaeDocumentItem(
    int LineNumber,
    string? ProductCode,
    string? Description,
    decimal? Quantity,
    decimal? Price,
    decimal? NetPrice,
    decimal? Cost,
    decimal? LineTotal,
    decimal? TaxAmount,
    decimal? LineTotalWithTax,
    decimal? PriceWithTax,
    decimal? Discount1,
    decimal? Discount2,
    decimal? Discount3,
    int? WarehouseNumber,
    int? MovementNumber,
    int? LotLink,
    string? SalesUnit
);
