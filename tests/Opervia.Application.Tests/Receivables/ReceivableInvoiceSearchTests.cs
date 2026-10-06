using Opervia.Application.Receivables;

namespace Opervia.Application.Tests.Receivables;

public sealed class ReceivableInvoiceSearchTests
{
    private static readonly ReceivableInvoiceSearchText[] Documents = [
        new("F-XA-006303", "1742", "María Patricia Pérez Martínez", ""),
        new("F-QR-080845", "1845", "Sofía Méndez", ""),
        new("F-XA-006295", "845", "Sofía Álvarez", ""),
        new("F-EQ000083", "1994", "Mostrador de Xalapa", "Sofía Méndez Rodríguez")
    ];

    [Fact]
    public void EmptySearchPreservesSourceOrder() => Assert.Equal([0, 1, 2, 3], ReceivableInvoiceSearch.Find(Documents, "  "));

    [Theory]
    [InlineData("sofia")]
    [InlineData("SOFÍA")]
    [InlineData(" sof ")]
    public void NamesIgnoreCaseAndAccentsAndSupportPrefixes(string query) =>
        Assert.Equal([1, 2, 3], ReceivableInvoiceSearch.Find(Documents, query));

    [Theory]
    [InlineData("fxa6303")]
    [InlineData("F-XA-006303")]
    [InlineData("F XA 6303")]
    public void InvoiceSearchAcceptsSeparatorsAndZeroPadding(string query) =>
        Assert.Equal([0], ReceivableInvoiceSearch.Find(Documents, query));

    [Fact]
    public void RequiresEveryWordRegardlessOfOrder() =>
        Assert.Equal([0], ReceivableInvoiceSearch.Find(Documents, "perez maria"));

    [Fact]
    public void AlsoFindsLegalNameBehindCommercialName() =>
        Assert.Equal([1, 3], ReceivableInvoiceSearch.Find(Documents, "mendez sofia"));

    [Fact]
    public void ExactCustomerKeyPrecedesPartialInvoiceMatches() =>
        Assert.Equal([2, 1], ReceivableInvoiceSearch.Find(Documents, "000845"));

    [Fact]
    public void CanCombineCustomerKeyAndName() =>
        Assert.Equal([0], ReceivableInvoiceSearch.Find(Documents, "1742 patricia"));

    [Theory]
    [InlineData("zzzzzzz")]
    [InlineData("sofia patricia")]
    [InlineData("%_")]
    public void UnmatchedTermsDoNotReturnUnrelatedDocuments(string query) =>
        Assert.Empty(ReceivableInvoiceSearch.Find(Documents, query));
}
