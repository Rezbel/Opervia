using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Application.Flows;

public interface ISaeSalesFlowBuilder
{
    Task<SaeSalesFlowResult> BuildAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind startingDocumentKind,
        string startingDocumentNumber,
        CancellationToken cancellationToken = default
    );
}
