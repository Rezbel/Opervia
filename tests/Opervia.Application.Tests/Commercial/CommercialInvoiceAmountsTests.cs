using Opervia.Application.Commercial;

namespace Opervia.Application.Tests.Commercial;

public sealed class CommercialInvoiceAmountsTests
{
    [Fact]
    public void KitComponentsConserveTheInvoiceTotalAndCents()
    {
        var parts = new CommercialPartAmount[] {
            new(167.15189873417722m, 193.89620253164557m),
            new(167.15189873417722m, 193.89620253164557m),
            new(360.69620253164555m, 418.40759493670884m)
        };
        var actual = CommercialInvoiceAmounts.Reconcile(parts, 695m, 806.20m, 0);
        Assert.Equal(695m, actual.Sum(x => x.WithoutTax));
        Assert.Equal(806.20m, actual.Sum(x => x.WithTax));
        Assert.All(actual, p => Assert.Equal(p.WithoutTax, Math.Round(p.WithoutTax, 2)));
    }

    [Fact]
    public void FinancialDiscountIsDistributedBeforeBrandFiltering()
    {
        var actual = CommercialInvoiceAmounts.Reconcile([new(100, 116), new(200, 232)], 270, 313.20m, 30);
        Assert.Equal(new CommercialPartAmount(90, 104.40m), actual[0]);
        Assert.Equal(new CommercialPartAmount(180, 208.80m), actual[1]);
    }

    [Fact]
    public void RealMismatchIsNotSilentlyHiddenByRounding()
    {
        Assert.Throws<InvalidOperationException>(() => CommercialInvoiceAmounts.Reconcile([new(1390, 1612.40m)], 695, 806.20m, 0));
    }

    [Fact]
    public void ZeroInvoiceIsHandledWithoutDivisionByZero()
    {
        var actual = CommercialInvoiceAmounts.Reconcile([new(0, 0)], 0, 0, 0);
        Assert.Equal(new CommercialPartAmount(0, 0), actual[0]);
    }
}
