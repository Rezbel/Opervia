using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Receivables;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/receivables")]
public sealed class SaeReceivablesController : ControllerBase
{
    private readonly ISaeReceivableProbe _receivableProbe;

    public SaeReceivablesController(
        ISaeReceivableProbe receivableProbe
    )
    {
        _receivableProbe = receivableProbe;
    }

    [HttpPost("{documentNumber}")]
    public async Task<ActionResult<SaeReceivableProbeResult>> ReadAsync(
        string documentNumber,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var profile = request.ToProfile();

        var result = await _receivableProbe.ReadAsync(
            profile,
            request.Password,
            documentNumber,
            cancellationToken
        );

        return Ok(result);
    }
}
