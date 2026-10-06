using Opervia.Domain.Connections;

namespace Opervia.Application.Receivables;

public sealed record SaeReceivableInvoiceAccountResult(bool IsSuccessful, string Message,
    SaeReceivableInvoiceAccount? Invoice, IReadOnlyList<SaeReceivableInvoiceAccountMovement> Movements, long ElapsedMilliseconds);
public sealed record SaeReceivableInvoiceAccount(string InvoiceNumber, string CustomerCode, string CustomerName,
    string SellerCode, DateTime? CreationDate, DateTime? DocumentDate, decimal AmountWithVat, decimal AmountWithoutVat,
    decimal VatAmount, decimal? Balance, decimal OriginalCharges, decimal AppliedReductions, DateTime? NextDueDate,
    string Status, string SaeStatus, int ChargeCount, string? Uuid);
public sealed record SaeReceivableInvoiceAccountMovement(string Key, string Reference, int ChargeNumber,
    int ConceptNumber, string ConceptDescription, string Document, decimal SignedAmount, DateTime? ApplicationDate,
    DateTime? DueDate, bool IsOriginalCharge, decimal? ChargeBalance, string? ChargeStatus);
public interface ISaeReceivableInvoiceAccountProbe
{
    Task<SaeReceivableInvoiceAccountResult> ReadAsync(SaeConnectionProfile profile, string password,
        string invoiceNumber, CancellationToken token = default);
}
