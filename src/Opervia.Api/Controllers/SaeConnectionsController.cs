using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Connections;
using Opervia.Domain.Connections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/connections/sae")]
public sealed class SaeConnectionsController : ControllerBase
{
    private readonly ISaeConnectionTester _connectionTester;

    public SaeConnectionsController(
        ISaeConnectionTester connectionTester
    )
    {
        _connectionTester = connectionTester;
    }

    [HttpPost("test")]
    [ProducesResponseType(
        typeof(SaeConnectionTestResult),
        StatusCodes.Status200OK
    )]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SaeConnectionTestResult>> TestAsync(
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
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

        var result = await _connectionTester.TestAsync(
            profile,
            request.Password,
            cancellationToken
        );

        return Ok(result);
    }
}
