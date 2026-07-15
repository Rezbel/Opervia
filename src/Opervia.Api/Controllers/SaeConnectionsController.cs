using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Connections;
using Opervia.Application.Schema;
using Opervia.Application.Tables;
using Opervia.Domain.Connections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/connections/sae")]
public sealed class SaeConnectionsController : ControllerBase
{
    private readonly ISaeConnectionTester _connectionTester;
    private readonly ISaeSchemaInspector _schemaInspector;
    private readonly ISaeTableStructureInspector _tableStructureInspector;

    public SaeConnectionsController(
        ISaeConnectionTester connectionTester,
        ISaeSchemaInspector schemaInspector,
        ISaeTableStructureInspector tableStructureInspector
    )
    {
        _connectionTester = connectionTester;
        _schemaInspector = schemaInspector;
        _tableStructureInspector = tableStructureInspector;
    }

    [HttpPost("test")]
    public async Task<ActionResult<SaeConnectionTestResult>> TestAsync(
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var result = await _connectionTester.TestAsync(
            CreateProfile(request),
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
        var result = await _schemaInspector.InspectAsync(
            CreateProfile(request),
            request.Password,
            cancellationToken
        );

        return Ok(result);
    }

    [HttpPost("inspect-table/{tableName}")]
    public async Task<ActionResult<SaeTableStructureResult>> InspectTableAsync(
        string tableName,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var result = await _tableStructureInspector.InspectAsync(
            CreateProfile(request),
            request.Password,
            tableName,
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
