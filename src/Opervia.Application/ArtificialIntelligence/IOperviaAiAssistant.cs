using Opervia.Application.DocumentItems;
using Opervia.Application.Flows;
using Opervia.Domain.Connections;

namespace Opervia.Application.ArtificialIntelligence;

public sealed record OperviaAiRequest(
    string Question,
    string CompanyLabel,
    SaeSalesFlowResult? Flow,
    SaeDocumentItemsResult? DocumentItems,
    string SaeEvidence
);

public sealed record OperviaAiAnswer(
    string Answer,
    string Summary,
    IReadOnlyList<string> Alerts,
    IReadOnlyList<string> SuggestedQuestions,
    string Model
);

public interface IOperviaAiAssistant
{
    bool IsConfigured { get; }
    Task<OperviaAiAnswer> AskAsync(
        OperviaAiRequest request,
        CancellationToken cancellationToken
    );
}

public interface IOperviaAiEvidenceProbe
{
    Task<string> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        string question,
        CancellationToken cancellationToken
    );
}

public sealed class OperviaAiUnavailableException(
    string message,
    Exception? innerException = null
) : Exception(message, innerException);
