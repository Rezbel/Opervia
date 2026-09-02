using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Connections;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/connections")]
public sealed class SaeConnectionProfilesController(
    ISaeConnectionProfileStore store
) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SavedSaeConnectionSummary>>> ListAsync(
        CancellationToken cancellationToken) =>
        Ok(await store.ListAsync(cancellationToken));

    [HttpGet("last-used")]
    public async Task<ActionResult<TestSaeConnectionRequest>> GetLastUsedAsync(
        CancellationToken cancellationToken)
    {
        var profile = await store.GetLastUsedAsync(cancellationToken);
        return profile is null ? NoContent() : Ok(ToRequest(profile));
    }

    [HttpGet("{id:guid}/use")]
    public async Task<ActionResult<TestSaeConnectionRequest>> UseAsync(
        Guid id, CancellationToken cancellationToken)
    {
        var profile = await store.GetAsync(id, true, cancellationToken);
        return profile is null ? NotFound() : Ok(ToRequest(profile));
    }

    [HttpPost]
    public async Task<ActionResult<SavedSaeConnectionSummary>> SaveAsync(
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken)
    {
        var saved = await store.SaveAsync(new(
            Guid.NewGuid(), request.DisplayName.Trim(), request.Host.Trim(),
            request.Port, request.Database.Trim(), request.Username.Trim(),
            request.Password, request.CompanyNumber.Trim(),
            request.SaeVersion.Trim(), request.Charset.Trim(),
            DateTime.UtcNow), cancellationToken);
        return Ok(saved);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(
        Guid id, CancellationToken cancellationToken) =>
        await store.DeleteAsync(id, cancellationToken)
            ? NoContent()
            : NotFound();

    private static TestSaeConnectionRequest ToRequest(
        SavedSaeConnectionProfile profile) => new()
        {
            DisplayName = profile.DisplayName,
            Host = profile.Host,
            Port = profile.Port,
            Database = profile.Database,
            Username = profile.Username,
            Password = profile.Password,
            CompanyNumber = profile.CompanyNumber,
            SaeVersion = profile.SaeVersion,
            Charset = profile.Charset
        };
}
