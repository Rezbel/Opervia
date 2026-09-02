using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Receivables;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/receivables/root")]
public sealed class SaeReceivableRootController : ControllerBase
{
    private readonly ISaeReceivableRootProbe _rootProbe;

    public SaeReceivableRootController(
        ISaeReceivableRootProbe rootProbe
    )
    {
        _rootProbe = rootProbe;
    }

    [HttpPost("{documentNumber}")]
    public async Task<ActionResult<SaeReceivableRootResult>> ReadAsync(
        string documentNumber,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var profile = request.ToProfile();

        var result = await _rootProbe.ReadAsync(
            profile,
            request.Password,
            documentNumber,
            cancellationToken
        );

        return Ok(result);
    }
}
