using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Connections;
using Opervia.Application.Schema;
using Opervia.Domain.Connections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/connections/sae")]
public sealed class SaeConnectionsController : ControllerBase
{
    private readonly ISaeConnectionTester _connectionTester;
    private readonly ISaeSchemaInspector _schemaInspector;

    public SaeConnectionsController(
        ISaeConnectionTester connectionTester,
        ISaeSchemaInspector schemaInspector
    )
    {
        _connectionTester = connectionTester;
        _schemaInspector = schemaInspector;
    }

    [HttpPost("test")]
    public async Task<ActionResult<SaeConnectionTestResult>> TestAsync(
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var profile = CreateProfile(request);

        var result = await _connectionTester.TestAsync(
            profile,
            request.Password,
            cancellationToken
        );

        return Ok(result);
    }

    [HttpPost("inspect-schema")]
    public async Task<ActionResult<SaeSchemaInspectionResult>> InspectSchemaAsync(
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var profile = CreateProfile(request);

        var result = await _schemaInspector.InspectAsync(
            profile,
            request.Password,
            cancellationToken
        );

        return Ok(result);
    }

    private static SaeConnectionProfile CreateProfile(
        TestSaeConnectionRequest request
    )
    {
        return new SaeConnectionProfile
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
    }
}
