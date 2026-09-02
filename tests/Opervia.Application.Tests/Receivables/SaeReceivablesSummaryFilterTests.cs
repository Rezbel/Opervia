using Opervia.Application.Receivables;

namespace Opervia.Application.Tests.Receivables;

public sealed class SaeReceivablesSummaryFilterTests
{
    [Fact]
    public void HasInvoiceFilters_IsFalseForEmptyFilter()
    {
        var filters = new SaeReceivablesSummaryFilter();

        Assert.False(filters.HasInvoiceFilters);
    }

    [Fact]
    public void HasInvoiceFilters_IsTrueForSeller()
    {
        var filters = new SaeReceivablesSummaryFilter(
            SellerCode: "1"
        );

        Assert.True(filters.HasInvoiceFilters);
    }

    [Fact]
    public void HasInvoiceFilters_IsTrueForFolioRange()
    {
        var filters = new SaeReceivablesSummaryFilter(
            Series: "F-QR-",
            FolioFrom: 79528,
            FolioTo: 80057
        );

        Assert.True(filters.HasInvoiceFilters);
    }

    [Fact]
    public void HasInvoiceFilters_IsFalseForPaymentConceptOnly()
    {
        var filters = new SaeReceivablesSummaryFilter(
            PaymentConceptNumber: 22
        );

        Assert.False(filters.HasInvoiceFilters);
    }
}
