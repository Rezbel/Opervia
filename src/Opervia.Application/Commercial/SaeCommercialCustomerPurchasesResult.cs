namespace Opervia.Application.Commercial;

public sealed record SaeCommercialCustomerPurchasesResult(
    bool IsSuccessful, string Message, DateOnly PeriodStart, DateOnly PeriodEnd,
    string CustomerCode, string CustomerName, decimal SalesWithoutTax, decimal SalesWithTax,
    int InvoiceCount, int ProductCount, IReadOnlyList<SaeCommercialPurchasedBrand> Brands, long ElapsedMilliseconds);

public sealed record SaeCommercialPurchasedBrand(string Brand, decimal SalesWithoutTax, decimal SalesWithTax,
    IReadOnlyList<SaeCommercialPurchasedProduct> Products);

public sealed record SaeCommercialPurchasedProduct(string ProductCode, string ProductName, string ProductLine,
    string ProductLineName, string Unit, decimal Quantity, decimal? AverageUnitPrice,
    decimal SalesWithoutTax, decimal SalesWithTax, DateOnly LastPurchaseDate,
    IReadOnlyList<SaeCommercialProductPurchase> Purchases);

public sealed record SaeCommercialProductPurchase(string InvoiceNumber, DateOnly ElaborationDate,
    decimal Quantity, decimal SalesWithoutTax, decimal SalesWithTax);

public sealed record CommercialProductSale(string InvoiceNumber, DateOnly ElaborationDate, string Brand,
    string ProductCode, string ProductName, string ProductLine, string ProductLineName, string Unit,
    decimal Quantity, decimal SalesWithoutTax, decimal SalesWithTax);

public static class CommercialCustomerPurchases
{
    public static SaeCommercialCustomerPurchasesResult Build(DateOnly from, DateOnly to,
        string customerCode, string customerName, IReadOnlyList<CommercialProductSale> sales, long elapsedMilliseconds)
    {
        var brands = sales.GroupBy(s => s.Brand).Select(brand => new SaeCommercialPurchasedBrand(
            brand.Key, brand.Sum(s => s.SalesWithoutTax), brand.Sum(s => s.SalesWithTax),
            brand.GroupBy(s => new { s.ProductCode, s.Unit }).Select(product =>
            {
                var latest = product.OrderByDescending(s => s.ElaborationDate).ThenByDescending(s => s.InvoiceNumber).First();
                var quantity = product.Sum(s => s.Quantity);
                var net = product.Sum(s => s.SalesWithoutTax);
                var purchases = product.GroupBy(s => new { s.InvoiceNumber, s.ElaborationDate })
                    .Select(invoice => new SaeCommercialProductPurchase(invoice.Key.InvoiceNumber, invoice.Key.ElaborationDate,
                        invoice.Sum(s => s.Quantity), invoice.Sum(s => s.SalesWithoutTax), invoice.Sum(s => s.SalesWithTax)))
                    .OrderByDescending(s => s.ElaborationDate).ThenByDescending(s => s.InvoiceNumber).ToArray();
                return new SaeCommercialPurchasedProduct(product.Key.ProductCode, latest.ProductName, latest.ProductLine,
                    latest.ProductLineName, product.Key.Unit, quantity,
                    quantity == 0 ? null : Math.Round(net / quantity, 2, MidpointRounding.AwayFromZero),
                    net, product.Sum(s => s.SalesWithTax), latest.ElaborationDate, purchases);
            }).OrderByDescending(p => p.SalesWithoutTax).ThenBy(p => p.ProductCode).ToArray()))
            .OrderByDescending(b => b.SalesWithoutTax).ThenBy(b => b.Brand).ToArray();
        return new(true, "Productos adquiridos del cliente, conciliados con sus facturas de SAE.", from, to,
            customerCode, customerName, sales.Sum(s => s.SalesWithoutTax), sales.Sum(s => s.SalesWithTax),
            sales.Select(s => s.InvoiceNumber).Distinct().Count(), sales.Select(s => s.ProductCode).Distinct().Count(),
            brands, elapsedMilliseconds);
    }
}
