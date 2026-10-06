namespace Opervia.Application.Commercial;

public sealed record CommercialPartAmount(decimal WithoutTax, decimal WithTax);

public static class CommercialInvoiceAmounts
{
    // Reconcile the full invoice before brand/line filtering to keep every
    // part's amount identical in individual and combined queries.
    public static IReadOnlyList<CommercialPartAmount> Reconcile(
        IReadOnlyList<CommercialPartAmount> parts, decimal invoiceWithoutTax,
        decimal invoiceWithTax, decimal financialDiscount)
    {
        if (parts.Count == 0) return [];
        var beforeDiscount = invoiceWithoutTax + financialDiscount;
        var factor = beforeDiscount == 0 ? 1 : invoiceWithoutTax / beforeDiscount;
        var adjusted = parts.Select(p => new CommercialPartAmount(p.WithoutTax * factor, p.WithTax * factor)).ToArray();
        if (Math.Abs(adjusted.Sum(p => p.WithoutTax) - invoiceWithoutTax) > 0.02m
            || Math.Abs(adjusted.Sum(p => p.WithTax) - invoiceWithTax) > 0.02m)
            throw new InvalidOperationException("Las partidas no coinciden con el total de la factura de SAE.");

        var rounded = adjusted.Select(p => new CommercialPartAmount(Round(p.WithoutTax), Round(p.WithTax))).ToArray();
        var largest = Enumerable.Range(0, parts.Count).MaxBy(i => Math.Abs(adjusted[i].WithoutTax));
        rounded[largest] = new(
            rounded[largest].WithoutTax + Round(invoiceWithoutTax) - rounded.Sum(p => p.WithoutTax),
            rounded[largest].WithTax + Round(invoiceWithTax) - rounded.Sum(p => p.WithTax));
        return rounded;
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
