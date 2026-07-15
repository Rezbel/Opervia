using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/document-lookup")]
public sealed class SaeDocumentLookupController : ControllerBase
{
    private readonly ISaeDocumentLookup _documentLookup;

    public SaeDocumentLookupController(
        ISaeDocumentLookup documentLookup
    )
    {
        _documentLookup = documentLookup;
    }

    [HttpPost("{documentKind}/{documentNumber}")]
    public async Task<ActionResult<SaeDocumentLookupResult>> FindAsync(
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

        var profile = new SaeConnectionProfile
        {
            DisplayName = request.DisplayName.Trim(),
            Host = request.Host.Trim(),
            Port = request.Port,
            Database = request.Database.Trim(),
            Username = request.Username.Trim(),
            CompanyNumber = request.CompanyNumber.Trim(),
            SaeVersion = request.SaeVersion.Trim(),
            Charset = request.Charset.Trim()
        };

        var result = await _documentLookup.FindAsync(
            profile,
            request.Password,
            parsedDocumentKind,
            documentNumber,
            cancellationToken
        );

        return Ok(result);
    }
}
