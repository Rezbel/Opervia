using Microsoft.AspNetCore.Mvc;
using Opervia.Application.Profitability;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/manual-profitability-entries")]
public sealed class ManualProfitabilityEntriesController(
    IManualProfitabilityStore store
) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ManualProfitabilityEntry>>> ListAsync(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to,
        [FromQuery] string? branch, CancellationToken cancellationToken)
    {
        if (from == default || to == default || to < from)
            return BadRequest(new { message = "Indica un periodo válido." });
        return Ok(await store.ListAsync(from, to, branch, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<ManualProfitabilityEntry>> AddAsync(
        [FromBody] CreateManualProfitabilityEntry entry,
        CancellationToken cancellationToken)
    {
        if (entry.EntryDate == default || string.IsNullOrWhiteSpace(entry.Category))
            return BadRequest(new { message = "La fecha y la categoría son obligatorias." });
        if (entry.Amount <= 0 || entry.Amount > 1_000_000_000m)
            return BadRequest(new { message = "El importe manual debe ser mayor a cero." });
        var result = await store.AddAsync(entry, cancellationToken);
        return Created($"/api/manual-profitability-entries/{result.Id}", result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id, CancellationToken cancellationToken) =>
        await store.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
