using Opervia.Application.Receivables;

namespace Opervia.Application.Tests.Receivables;

public sealed class ReceivableInvoiceAccountingTests
{
    private static readonly DateOnly Today = new(2026, 10, 6);

    [Fact]
    public void ChargeZeroIsPaidWithoutSettlingTheOtherInstallments()
    {
        ReceivableInvoiceApplication[] applications = [new("F-EQ000082", 0, -55656.8m)];
        var deposit = ReceivableInvoiceAccounting.Calculate([new("F-EQ000082", 0, 55656.8m, new(2026, 9, 29))], applications, false, Today);
        var overdue = ReceivableInvoiceAccounting.Calculate([new("F-EQ000082", 1, 24736.36m, new(2026, 9, 29))], applications, false, Today);
        var upcoming = ReceivableInvoiceAccounting.Calculate([new("F-EQ000082", 2, 24736.36m, new(2026, 10, 29))], applications, false, Today);
        Assert.Equal(0m, deposit.Balance);
        Assert.Equal("Liquidada", deposit.Status);
        Assert.Null(deposit.NextDueDate);
        Assert.Equal(24736.36m, overdue.Balance);
        Assert.Equal("Vencido", overdue.Status);
        Assert.Equal(24736.36m, upcoming.Balance);
        Assert.Equal("Adeudo", upcoming.Status);
    }

    [Fact]
    public void PaidDepositDoesNotSettleTheRemainingInstallments()
    {
        var charges = new List<ReceivableInvoiceCharge> {
            new("F-EQ000082", 0, 55656.8m, new(2026, 9, 29)),
            new("F-EQ000082", 1, 24736.36m, new(2026, 9, 29))
        };
        for (var n = 2; n <= 8; n++) charges.Add(new("F-EQ000082", n, 24736.36m, new DateTime(2026, 9, 29).AddMonths(n - 1)));
        charges.Add(new("F-EQ000082", 9, 24736.32m, new(2027, 5, 29)));
        var account = ReceivableInvoiceAccounting.Calculate(charges, [new("F-EQ000082", 0, -55656.8m)], false, Today);
        Assert.Equal(278284m, account.Charges);
        Assert.Equal(55656.8m, account.Reductions);
        Assert.Equal(222627.20m, account.Balance);
        Assert.Equal(new DateTime(2026, 9, 29), account.NextDueDate);
        Assert.Equal("Vencido", account.Status);
    }

    [Fact]
    public void IgnoresDueDatesOfFullyPaidInstallments()
    {
        var account = ReceivableInvoiceAccounting.Calculate(
            [new("F1", 0, 100, new(2026, 9, 1)), new("F1", 1, 200, new(2026, 11, 1))],
            [new("F1", 0, -100)], false, Today);
        Assert.Equal(200m, account.Balance);
        Assert.Equal(new DateTime(2026, 11, 1), account.NextDueDate);
        Assert.Equal("Adeudo", account.Status);
    }

    [Fact]
    public void PartialPaymentLeavesOutstandingBalance()
    {
        var account = ReceivableInvoiceAccounting.Calculate([new("F1", 0, 1160, new(2026, 11, 1))],
            [new("F1", 0, -500)], false, Today);
        Assert.Equal(660m, account.Balance);
        Assert.Equal("Adeudo", account.Status);
    }

    [Fact]
    public void MatchesApplicationsByBothReferenceAndChargeNumber()
    {
        var account = ReceivableInvoiceAccounting.Calculate([new("F1", 0, 100, new(2026, 9, 1))],
            [new("F1", 1, -100), new("F2", 0, -100), new("F1", 0, -25)], false, Today);
        Assert.Equal(75m, account.Balance);
        Assert.Equal(25m, account.Reductions);
        Assert.Equal("Vencido", account.Status);
    }

    [Fact]
    public void FullyPaidInvoiceHasNoPendingDueDate()
    {
        var account = ReceivableInvoiceAccounting.Calculate([new("F1", 0, 100, new(2026, 9, 1))],
            [new("F1", 0, -100)], false, Today);
        Assert.Equal(0m, account.Balance);
        Assert.Null(account.NextDueDate);
        Assert.Equal("Liquidada", account.Status);
    }

    [Fact]
    public void CancelledInvoiceKeepsItsStatus()
    {
        var account = ReceivableInvoiceAccounting.Calculate([new("F1", 0, 100, new(2026, 9, 1))], [], true, Today);
        Assert.Equal("Cancelada", account.Status);
    }

    [Fact]
    public void MissingChargesCannotBeReportedAsPaid()
    {
        var account = ReceivableInvoiceAccounting.Calculate([], [new("F1", 0, -100)], false, Today);
        Assert.Null(account.Balance);
        Assert.Equal("Sin datos", account.Status);
    }
}
