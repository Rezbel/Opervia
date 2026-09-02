using Opervia.Api.Contracts.Connections;
using Opervia.Application.DocumentItems;
using Opervia.Application.Flows;

namespace Opervia.Api.Contracts.ArtificialIntelligence;

public sealed record AskOperviaAiRequest(
    string Question,
    string CompanyLabel,
    TestSaeConnectionRequest Connection,
    SaeSalesFlowResult? Flow,
    SaeDocumentItemsResult? DocumentItems
);
