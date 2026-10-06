using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Receivables;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/receivables/invoices")]
public sealed class SaeReceivableInvoicesController(ISaeReceivableInvoiceListingProbe probe) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeReceivableInvoiceListingResult>> ReadAsync(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        if (from == default || to == default || to < from || to.DayNumber - from.DayNumber > 366)
            return BadRequest(new { message = "Indica un periodo válido de hasta 367 días." });
        if (page < 1 || pageSize is < 1 or > 100 || search?.Length > 120)
            return BadRequest(new { message = "Revisa la página, el tamaño y el texto de búsqueda (máximo 120 caracteres)." });
        return Ok(await probe.ReadAsync(request.ToProfile(), request.Password, from, to, search, page, pageSize, cancellationToken));
    }
}
