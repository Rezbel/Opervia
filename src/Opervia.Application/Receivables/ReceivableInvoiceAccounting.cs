namespace Opervia.Application.Receivables;

public sealed record ReceivableInvoiceCharge(string Reference, int Charge, decimal SignedAmount, DateTime? DueDate);
public sealed record ReceivableInvoiceApplication(string Reference, int Charge, decimal SignedAmount);
public sealed record ReceivableInvoiceAccountSummary(decimal? Balance, decimal Charges, decimal Reductions, DateTime? NextDueDate, string Status);

public static class ReceivableInvoiceAccounting
{
    public static ReceivableInvoiceAccountSummary Calculate(IReadOnlyList<ReceivableInvoiceCharge> charges,
        IReadOnlyList<ReceivableInvoiceApplication> applications, bool cancelled, DateOnly today)
    {
        if (charges.Count == 0) return new(null, 0, 0, null, cancelled ? "Cancelada" : "Sin datos");
        var accounts = charges.GroupBy(row => (row.Reference, row.Charge)).ToDictionary(group => group.Key,
            group => (Amount: group.Sum(row => row.SignedAmount), Due: group.Where(row => row.DueDate.HasValue).Select(row => row.DueDate).DefaultIfEmpty().Min()));
        var applied = applications.Where(row => accounts.ContainsKey((row.Reference, row.Charge)))
            .GroupBy(row => (row.Reference, row.Charge)).ToDictionary(group => group.Key, group => group.Sum(row => row.SignedAmount));
        var remaining = accounts.Select(row => (Amount: row.Value.Amount + applied.GetValueOrDefault(row.Key), row.Value.Due)).ToArray();
        var balance = remaining.Sum(row => row.Amount);
        var due = remaining.Where(row => row.Amount > 0.005m && row.Due.HasValue).Select(row => row.Due).DefaultIfEmpty().Min();
        var status = cancelled ? "Cancelada" : balance <= 0.01m ? "Liquidada" :
            due.HasValue && DateOnly.FromDateTime(due.Value) < today ? "Vencido" : "Adeudo";
        return new(decimal.Round(balance, 2, MidpointRounding.AwayFromZero),
            charges.Where(row => row.SignedAmount > 0).Sum(row => row.SignedAmount),
            -charges.Where(row => row.SignedAmount < 0).Sum(row => row.SignedAmount) -
                applications.Where(row => accounts.ContainsKey((row.Reference, row.Charge)) && row.SignedAmount < 0).Sum(row => row.SignedAmount),
            due, status);
    }
}
