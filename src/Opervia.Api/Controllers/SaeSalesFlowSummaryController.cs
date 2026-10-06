using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Flows;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/sales-flow/summary")]
public sealed class SaeSalesFlowSummaryController(
    ISaeSalesFlowSummaryProbe summaryProbe
) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeSalesFlowSummaryResult>> ReadAsync(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? seller,
        [FromQuery] string? documentKind,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? branch = null,
        [FromQuery] string? search = null)
    {
        if (from == default || to == default || to < from)
        {
            return BadRequest(new
            {
                message = "Indica un periodo de consulta válido."
            });
        }

        if (to.DayNumber - from.DayNumber > 366)
        {
            return BadRequest(new
            {
                message = "El análisis de flujos admite periodos de hasta 367 días."
            });
        }

        var result = await summaryProbe.ReadAsync(
            request.ToProfile(),
            request.Password,
            from,
            to,
            string.IsNullOrWhiteSpace(seller) ? null : seller.Trim(),
            cancellationToken, documentKind, page, pageSize, branch, search);

        return Ok(result);
    }
}
