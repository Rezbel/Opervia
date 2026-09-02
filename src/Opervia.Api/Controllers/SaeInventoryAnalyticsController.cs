using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Inventory;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/inventory/analytics")]
public sealed class SaeInventoryAnalyticsController(
    ISaeInventoryAnalyticsProbe probe
) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeInventoryAnalyticsResult>> ReadAsync(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? seller,
        [FromQuery] int? warehouse,
        [FromQuery] string? line,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken)
    {
        if (from == default || to == default || to < from)
            return BadRequest(new { message = "Indica un periodo de consulta válido." });
        if (to.DayNumber - from.DayNumber > 366)
            return BadRequest(new { message = "El análisis admite periodos de hasta 367 días." });
        if (warehouse is < 0)
            return BadRequest(new { message = "El almacén seleccionado no es válido." });

        var result = await probe.ReadAsync(
            request.ToProfile(), request.Password, from, to,
            string.IsNullOrWhiteSpace(seller) ? null : seller.Trim(),
            warehouse,
            string.IsNullOrWhiteSpace(line) ? null : line.Trim(),
            cancellationToken);
        return Ok(result);
    }
}
