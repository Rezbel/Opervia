using System.Globalization;
using System.Text;

namespace Opervia.Application.Receivables;

public enum SaeReceivableReductionKind
{
    RealPayment,
    ReturnOrCredit,
    AppliedAdvance,
    Other
}

public static class SaeReceivableConceptClassifier
{
    private static readonly HashSet<int> RealPaymentConcepts =
        [9, 10, 11, 15, 22, 23, 24, 1003];

    private static readonly HashSet<int> ReturnOrCreditConcepts =
        [8, 12, 26, 1001, 1002];

    private static readonly HashSet<int> AppliedAdvanceConcepts =
        [17, 25];

    public static SaeReceivableReductionKind Classify(
        int conceptNumber,
        string? description
    )
    {
        if (ReturnOrCreditConcepts.Contains(conceptNumber))
        {
            return SaeReceivableReductionKind.ReturnOrCredit;
        }

        if (AppliedAdvanceConcepts.Contains(conceptNumber))
        {
            return SaeReceivableReductionKind.AppliedAdvance;
        }

        if (RealPaymentConcepts.Contains(conceptNumber))
        {
            return SaeReceivableReductionKind.RealPayment;
        }

        var normalizedDescription = Normalize(description);

        if (ContainsAny(
                normalizedDescription,
                "DEVOL",
                "NOTA CRED",
                "NOTA DE CRED",
                "BONIFIC"
            ))
        {
            return SaeReceivableReductionKind.ReturnOrCredit;
        }

        if (ContainsAny(
                normalizedDescription,
                "APLIC ANTICIPO",
                "APLIC. ANTICIPO",
                "SALDO A FAVOR"
            ))
        {
            return SaeReceivableReductionKind.AppliedAdvance;
        }

        if (ContainsAny(
                normalizedDescription,
                "EFECTIVO",
                "TRANSFER",
                "DEPOSITO",
                "PAGO TDC",
                "PAGO TDD",
                "TARJETA",
                "CHEQUE CERTIF",
                "CODI"
            ))
        {
            return SaeReceivableReductionKind.RealPayment;
        }

        return SaeReceivableReductionKind.Other;
    }

    public static string GetLabel(
        SaeReceivableReductionKind kind
    )
    {
        return kind switch
        {
            SaeReceivableReductionKind.RealPayment =>
                "Ingreso real",
            SaeReceivableReductionKind.ReturnOrCredit =>
                "Devolución o crédito",
            SaeReceivableReductionKind.AppliedAdvance =>
                "Anticipo aplicado",
            _ => "Otra reducción"
        };
    }

    private static bool ContainsAny(
        string value,
        params string[] candidates
    )
    {
        return candidates.Any(
            candidate => value.Contains(
                candidate,
                StringComparison.Ordinal
            )
        );
    }

    private static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var decomposed = value
            .Trim()
            .ToUpperInvariant()
            .Normalize(NormalizationForm.FormD);

        var builder = new StringBuilder(decomposed.Length);

        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) !=
                UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character);
            }
        }

        return builder.ToString()
            .Normalize(NormalizationForm.FormC);
    }
}
