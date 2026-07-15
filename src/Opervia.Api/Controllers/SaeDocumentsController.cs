using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Documents;
using Opervia.Domain.Connections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/documents")]
public sealed class SaeDocumentsController : ControllerBase
{
    private readonly ISaeDocumentProbe _documentProbe;

    public SaeDocumentsController(
        ISaeDocumentProbe documentProbe
    )
    {
        _documentProbe = documentProbe;
    }

    [HttpPost("latest/{documentKind}")]
    public async Task<ActionResult<SaeDocumentProbeResult>> ReadLatestAsync(
        string documentKind,
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

        var result = await _documentProbe.ReadLatestAsync(
            profile,
            request.Password,
            parsedDocumentKind,
            cancellationToken
        );

        return Ok(result);
    }
}
