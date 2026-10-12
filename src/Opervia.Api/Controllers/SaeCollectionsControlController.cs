using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Collections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/collections/control")]
public sealed class SaeCollectionsControlController(ISaeCollectionsControlProbe probe) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeCollectionsControlResult>> ReadAsync([FromBody] TestSaeConnectionRequest request, CancellationToken token)
        => Ok(await probe.ReadAsync(request.ToProfile(), request.Password, token));
}
