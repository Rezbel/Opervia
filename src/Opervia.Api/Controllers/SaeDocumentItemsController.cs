using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.DocumentItems;
using Opervia.Application.Documents;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/document-items")]
public sealed class SaeDocumentItemsController : ControllerBase
{
    private readonly ISaeDocumentItemsReader _itemsReader;

    public SaeDocumentItemsController(
        ISaeDocumentItemsReader itemsReader
    )
    {
        _itemsReader = itemsReader;
    }

    [HttpPost("{documentKind}/{documentNumber}")]
    public async Task<ActionResult<SaeDocumentItemsResult>> ReadAsync(
        string documentKind,
        string documentNumber,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        if (!Enum.TryParse<SaeDocumentKind>(
                documentKind,
                ignoreCase: true,
                out var parsedDocumentKind
            ))
        {
            return BadRequest(new
            {
                message =
                    "Tipo inválido. Usa Quotation, Order, Delivery o Invoice."
            });
        }

        var profile = request.ToProfile();

        var result = await _itemsReader.ReadAsync(
            profile,
            request.Password,
            parsedDocumentKind,
            documentNumber,
            cancellationToken
        );

        return Ok(result);
    }
}
