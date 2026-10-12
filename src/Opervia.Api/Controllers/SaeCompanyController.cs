using Microsoft.AspNetCore.Mvc;
using Opervia.Application.Connections;
using Opervia.Infrastructure.Firebird;

namespace Opervia.Api.Controllers;

[ApiController, Route("api/sae/company")]
public sealed class SaeCompanyController(ISaeConnectionProfileStore profiles, FirebirdCompanyReader reader) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<SaeCompanyIdentity>> Read(CancellationToken token)
    {
        var profile = await profiles.GetLastUsedAsync(token);
        return Ok(profile is null ? new SaeCompanyIdentity(false, null) : await reader.ReadAsync(profile, token));
    }
}
