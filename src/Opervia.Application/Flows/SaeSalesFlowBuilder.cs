using System.Diagnostics;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Application.Flows;

public sealed class SaeSalesFlowBuilder : ISaeSalesFlowBuilder
{
    private const int MaximumDocuments = 12;

    private readonly ISaeDocumentLookup _documentLookup;

    public SaeSalesFlowBuilder(
        ISaeDocumentLookup documentLookup
    )
    {
        _documentLookup = documentLookup;
    }

    public async Task<SaeSalesFlowResult> BuildAsync(
        SaeConnectionProfile profile,
        string password,
        SaeDocumentKind startingDocumentKind,
        string startingDocumentNumber,
        CancellationToken cancellationToken = default
    )
    {
        var normalizedStartingNumber =
            startingDocumentNumber?.Trim();

        if (string.IsNullOrWhiteSpace(normalizedStartingNumber))
        {
            throw new ArgumentException(
                "El número de documento inicial es obligatorio.",
                nameof(startingDocumentNumber)
            );
        }

        var stopwatch = Stopwatch.StartNew();

        var discoveredDocuments =
            new List<DiscoveredDocument>();

        var warnings =
            new List<string>();

        var visited =
            new HashSet<string>(
                StringComparer.OrdinalIgnoreCase
            );

        var currentKind =
            startingDocumentKind;

        var currentNumber =
            normalizedStartingNumber;

        for (var index = 0;
             index < MaximumDocuments;
             index++)
        {
            var visitKey =
                $"{currentKind}:{currentNumber}";

            if (!visited.Add(visitKey))
            {
                warnings.Add(
                    $"Se detectó un ciclo en el documento {currentNumber}."
                );

                break;
            }

            var lookupResult =
                await _documentLookup.FindAsync(
                    profile,
                    password,
                    currentKind,
                    currentNumber,
                    cancellationToken
                );

            if (!lookupResult.IsSuccessful ||
                lookupResult.Document is null)
            {
                stopwatch.Stop();

                if (discoveredDocuments.Count == 0)
                {
                    return new SaeSalesFlowResult(
                        false,
                        lookupResult.Message,
                        normalizedStartingNumber,
                        Array.Empty<SaeSalesFlowNode>(),
                        Array.Empty<SaeSalesFlowEdge>(),
                        warnings,
                        stopwatch.ElapsedMilliseconds
                    );
                }

                warnings.Add(lookupResult.Message);
                break;
            }

            discoveredDocuments.Add(
                new DiscoveredDocument(
                    currentKind,
                    lookupResult.Document
                )
            );

            var previousNumber =
                lookupResult.Document
                    .PreviousDocumentNumber?
                    .Trim();

            if (string.IsNullOrWhiteSpace(previousNumber))
            {
                break;
            }

            var previousKind =
                ResolveKind(
                    lookupResult.Document
                        .PreviousDocumentType
                );

            if (previousKind is null)
            {
                warnings.Add(
                    $"No se reconoció el tipo anterior " +
                    $"'{lookupResult.Document.PreviousDocumentType}' " +
                    $"del documento {lookupResult.Document.DocumentNumber}."
                );

                break;
            }

            currentKind =
                previousKind.Value;

            currentNumber =
                previousNumber;
        }

        if (discoveredDocuments.Count == MaximumDocuments)
        {
            warnings.Add(
                $"El recorrido alcanzó el límite de {MaximumDocuments} documentos."
            );
        }

        discoveredDocuments.Reverse();

        var nodes =
            discoveredDocuments
                .Select((item, sequence) =>
                    CreateNode(item, sequence)
                )
                .ToArray();

        var edges =
            new List<SaeSalesFlowEdge>();

        for (var index = 0;
             index < nodes.Length - 1;
             index++)
        {
            var source =
                nodes[index];

            var target =
                nodes[index + 1];

            edges.Add(
                new SaeSalesFlowEdge(
                    $"edge:{source.Id}:{target.Id}",
                    source.Id,
                    target.Id,
                    "generated"
                )
            );

            ValidateRelationship(
                source,
                target,
                warnings
            );
        }

        stopwatch.Stop();

        return new SaeSalesFlowResult(
            true,
            $"Se reconstruyó un flujo de {nodes.Length} documentos.",
            normalizedStartingNumber,
            nodes,
            edges,
            warnings,
            stopwatch.ElapsedMilliseconds
        );
    }

    private static SaeSalesFlowNode CreateNode(
        DiscoveredDocument item,
        int sequence
    )
    {
        var document =
            item.Document;

        var kind =
            item.Kind.ToString();

        return new SaeSalesFlowNode(
            $"{kind.ToLowerInvariant()}:{document.DocumentNumber}",
            sequence,
            kind,
            document.DocumentType,
            document.DocumentNumber,
            document.CustomerCode,
            document.Status,
            document.DocumentDate,
            document.Amount,
            document.PreviousDocumentNumber,
            document.NextDocumentNumber
        );
    }

    private static void ValidateRelationship(
        SaeSalesFlowNode source,
        SaeSalesFlowNode target,
        ICollection<string> warnings
    )
    {
        if (!string.Equals(
                source.NextDocumentNumber,
                target.DocumentNumber,
                StringComparison.OrdinalIgnoreCase
            ))
        {
            warnings.Add(
                $"{source.DocumentNumber} no apunta directamente " +
                $"a {target.DocumentNumber} como documento siguiente."
            );
        }

        if (!string.Equals(
                target.PreviousDocumentNumber,
                source.DocumentNumber,
                StringComparison.OrdinalIgnoreCase
            ))
        {
            warnings.Add(
                $"{target.DocumentNumber} no reconoce " +
                $"{source.DocumentNumber} como documento anterior."
            );
        }

        if (!string.Equals(
                source.CustomerCode,
                target.CustomerCode,
                StringComparison.OrdinalIgnoreCase
            ))
        {
            warnings.Add(
                $"El cliente cambia entre {source.DocumentNumber} " +
                $"y {target.DocumentNumber}."
            );
        }
    }

    private static SaeDocumentKind? ResolveKind(
        string? documentType
    )
    {
        return documentType?
            .Trim()
            .ToUpperInvariant() switch
        {
            "C" => SaeDocumentKind.Quotation,
            "P" => SaeDocumentKind.Order,
            "R" => SaeDocumentKind.Delivery,
            "F" => SaeDocumentKind.Invoice,
            _ => null
        };
    }

    private sealed record DiscoveredDocument(
        SaeDocumentKind Kind,
        SaeDocumentHeader Document
    );
}
