using Opervia.Domain.Connections;
using Opervia.Application.Documents;
namespace Opervia.Application.Flows;
public sealed record SaeDocumentLink(SaeDocumentKind SourceKind, string SourceNumber, SaeDocumentKind TargetKind, string TargetNumber);
public interface ISaeDocumentLinksReader
{
    Task<IReadOnlyList<SaeDocumentLink>> ReadAsync(SaeConnectionProfile profile, string password,
        SaeDocumentKind kind, string number, CancellationToken cancellationToken = default);
}
