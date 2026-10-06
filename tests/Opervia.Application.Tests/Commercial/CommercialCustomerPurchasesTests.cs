using Opervia.Application.Commercial;

namespace Opervia.Application.Tests.Commercial;

public sealed class CommercialCustomerPurchasesTests
{
    private static readonly DateOnly Date = new(2026, 10, 6);
    private static CommercialProductSale Sale(string doc, string brand, string code, string unit,
        decimal quantity, decimal net, DateOnly? date = null) =>
        new(doc, date ?? Date, brand, code, "Producto " + code, "SP", "Línea", unit, quantity, net, net * 1.16m);

    [Fact]
    public void ProductAndInvoiceTotalsReconcileAndAverageIsWeighted()
    {
        var result = CommercialCustomerPurchases.Build(Date, Date, "520", "Cliente",
            [Sale("F1", "SPINREACT", "P1", "PZA", 2, 20), Sale("F2", "SPINREACT", "P1", "PZA", 1, 15),
             Sale("F2", "MAGLUMI", "P2", "CAJA", 1, 100)], 0);
        Assert.Equal(2, result.ProductCount);
        Assert.Equal(2, result.InvoiceCount);
        Assert.Equal(135m, result.SalesWithoutTax);
        Assert.Equal(156.60m, result.SalesWithTax);
        var product = result.Brands.Single(b => b.Brand == "SPINREACT").Products.Single();
        Assert.Equal(3, product.Quantity);
        Assert.Equal(11.67m, product.AverageUnitPrice);
        Assert.Equal(35m, product.Purchases.Sum(p => p.SalesWithoutTax));
        Assert.Equal(3m, product.Purchases.Sum(p => p.Quantity));
        Assert.Equal("MAGLUMI", result.Brands[0].Brand);
    }

    [Fact]
    public void DifferentUnitsAreNotCombinedForTheSameProduct()
    {
        var result = CommercialCustomerPurchases.Build(Date, Date, "520", "Cliente",
            [Sale("F1", "SPINREACT", "P1", "PZA", 10, 100), Sale("F2", "SPINREACT", "P1", "CAJA", 1, 80)], 0);
        Assert.Equal(1, result.ProductCount);
        Assert.Equal(2, result.Brands.Single().Products.Count);
        Assert.Equal(10m, result.Brands.Single().Products.Single(p => p.Unit == "PZA").AverageUnitPrice);
        Assert.Equal(80m, result.Brands.Single().Products.Single(p => p.Unit == "CAJA").AverageUnitPrice);
    }

    [Fact]
    public void RepeatedLinesInOneInvoiceCountAsOnePurchaseAndLatestDateIsShown()
    {
        var result = CommercialCustomerPurchases.Build(Date.AddDays(-7), Date, "520", "Cliente",
            [Sale("F1", "SPINREACT", "P1", "PZA", 1, 10, Date.AddDays(-3)),
             Sale("F1", "SPINREACT", "P1", "PZA", 2, 20, Date.AddDays(-3)),
             Sale("F2", "SPINREACT", "P1", "PZA", 1, 12)], 0);
        var product = result.Brands.Single().Products.Single();
        Assert.Equal(2, product.Purchases.Count);
        Assert.Equal(Date, product.LastPurchaseDate);
        Assert.Equal("F2", product.Purchases[0].InvoiceNumber);
        Assert.Equal(3m, product.Purchases.Single(p => p.InvoiceNumber == "F1").Quantity);
    }

    [Fact]
    public void EmptyCustomerPurchasesHaveNoInventedAmounts()
    {
        var result = CommercialCustomerPurchases.Build(Date, Date, "520", "Cliente", [], 0);
        Assert.Empty(result.Brands);
        Assert.Equal(0, result.SalesWithoutTax);
        Assert.Equal(0, result.InvoiceCount);
        Assert.Equal(0, result.ProductCount);
    }
}
