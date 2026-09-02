using Opervia.Application.Receivables;

namespace Opervia.Application.Tests.Receivables;

public sealed class SaeReceivableConceptClassifierTests
{
    [Theory]
    [InlineData(10, "Efectivo")]
    [InlineData(11, "Cheque")]
    [InlineData(22, "Transferencia")]
    [InlineData(23, "PAGO TDC")]
    [InlineData(24, "PAGO TDD")]
    [InlineData(1003, "Pago con CoDi")]
    public void Classify_RecognizesRealPayments(
        int conceptNumber,
        string description
    )
    {
        var result =
            SaeReceivableConceptClassifier.Classify(
                conceptNumber,
                description
            );

        Assert.Equal(
            SaeReceivableReductionKind.RealPayment,
            result
        );
    }

    [Theory]
    [InlineData(12, "Nota devolución")]
    [InlineData(1002, "Nota de crédito")]
    public void Classify_SeparatesReturnsAndCredits(
        int conceptNumber,
        string description
    )
    {
        var result =
            SaeReceivableConceptClassifier.Classify(
                conceptNumber,
                description
            );

        Assert.Equal(
            SaeReceivableReductionKind.ReturnOrCredit,
            result
        );
    }

    [Fact]
    public void Classify_DoesNotTreatAppliedAdvanceAsNewIncome()
    {
        var result =
            SaeReceivableConceptClassifier.Classify(
                17,
                "Aplic. Anticipo"
            );

        Assert.Equal(
            SaeReceivableReductionKind.AppliedAdvance,
            result
        );
    }

    [Fact]
    public void Classify_DoesNotTreatPromissoryNoteAsCash()
    {
        var result =
            SaeReceivableConceptClassifier.Classify(
                14,
                "Letra (A)"
            );

        Assert.Equal(
            SaeReceivableReductionKind.Other,
            result
        );
    }
}
