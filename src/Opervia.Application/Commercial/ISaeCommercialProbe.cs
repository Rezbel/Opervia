using Opervia.Domain.Connections;
namespace Opervia.Application.Commercial;
public interface ISaeCommercialProbe
{
    Task<SaeCommercialResult> ReadAsync(SaeConnectionProfile profile, string password, DateOnly from, DateOnly to, SaeCommercialFilter filter, CancellationToken cancellationToken = default);
    Task<SaeCommercialCustomerPurchasesResult> ReadCustomerPurchasesAsync(SaeConnectionProfile profile, string password, DateOnly from, DateOnly to, SaeCommercialFilter filter, CancellationToken cancellationToken = default);
}
public sealed record SaeCommercialFilter(string? SellerCode, string? Brand, string? ProductLine, string? Customer);
public sealed record SaeCommercialResult(bool IsSuccessful, string Message, DateOnly PeriodStart, DateOnly PeriodEnd, decimal SalesWithoutTax, decimal SalesWithTax, int InvoiceCount, int CustomerCount, IReadOnlyList<SaeCommercialBrand> Brands, IReadOnlyList<SaeCommercialCustomer> Customers, IReadOnlyList<SaeCommercialOption> Sellers, IReadOnlyList<SaeCommercialOption> BrandOptions, IReadOnlyList<SaeCommercialOption> ProductLines, long ElapsedMilliseconds);
public sealed record SaeCommercialBrand(string Brand, decimal SalesWithoutTax, decimal SalesWithTax, int InvoiceCount, int CustomerCount);
public sealed record SaeCommercialCustomer(string CustomerCode, string CustomerName, decimal SalesWithoutTax, decimal SalesWithTax, int InvoiceCount, IReadOnlyList<SaeCommercialBrandAmount> Brands);
public sealed record SaeCommercialBrandAmount(string Brand, decimal SalesWithoutTax, decimal SalesWithTax);
public sealed record SaeCommercialOption(string Value, string Label);
