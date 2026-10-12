using Opervia.Domain.Connections;

namespace Opervia.Application.Collections;

public interface ISaeCollectionsControlProbe
{
    Task<SaeCollectionsControlResult> ReadAsync(SaeConnectionProfile profile, string password, CancellationToken token = default);
}

public sealed record SaeCollectionsControlResult(bool IsSuccessful, string Message, DateOnly AsOfDate,
    DateTimeOffset GeneratedAt, IReadOnlyList<CollectionCustomer> Customers, IReadOnlyList<CollectionPendingCharge> Charges,
    IReadOnlyList<CollectionAccountTotal> Accounts, long ElapsedMilliseconds);

public sealed record CollectionCustomer(string Code, string Name, string Status, string Classification,
    string AssignedSeller, decimal? CatalogBalance);

public sealed record CollectionPendingCharge(string CustomerCode, string InvoiceNumber, string Reference, int ChargeNumber,
    string SellerCode, string SellerName, DateTime? CreationDate, DateTime? DueDate, decimal OriginalAmount, decimal Balance, string Bucket);

// Credits remain attached to their own account. They are not arbitrarily assigned to an overdue invoice.
public sealed record CollectionAccountTotal(string CustomerCode, string SellerCode, decimal LedgerBalance,
    decimal CreditBalance, decimal OtherBalance, decimal PendingBalance);
