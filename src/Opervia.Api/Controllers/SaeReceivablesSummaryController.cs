using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Receivables;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/receivables/summary")]
public sealed class SaeReceivablesSummaryController(
    ISaeReceivablesSummaryProbe summaryProbe
) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeReceivablesSummaryResult>>
        ReadAsync(
            [FromQuery] DateOnly from,
            [FromQuery] DateOnly to,
            [FromQuery] string? seller,
            [FromQuery] string? series,
            [FromQuery] int? folioFrom,
            [FromQuery] int? folioTo,
            [FromQuery] string? customer,
            [FromQuery] int? warehouse,
            [FromQuery] string? status,
            [FromQuery] string? fiscalMethod,
            [FromQuery] int? paymentConcept,
            [FromBody] TestSaeConnectionRequest request,
            CancellationToken cancellationToken
        )
    {
        if (from == default || to == default)
        {
            return BadRequest(
                new
                {
                    message =
                        "Las fechas inicial y final son obligatorias."
                }
            );
        }

        if (to < from)
        {
            return BadRequest(
                new
                {
                    message =
                        "La fecha final debe ser igual o posterior a la inicial."
                }
            );
        }

        if (to.DayNumber - from.DayNumber > 366)
        {
            return BadRequest(
                new
                {
                    message =
                        "El resumen admite periodos de hasta 367 días."
                }
            );
        }

        if (folioFrom is < 0 || folioTo is < 0)
        {
            return BadRequest(
                new
                {
                    message =
                        "Los folios no pueden ser negativos."
                }
            );
        }

        if (folioFrom.HasValue &&
            folioTo.HasValue &&
            folioTo < folioFrom)
        {
            return BadRequest(
                new
                {
                    message =
                        "El folio final debe ser igual o mayor al inicial."
                }
            );
        }

        var filters = new SaeReceivablesSummaryFilter(
            seller?.Trim(),
            series?.Trim(),
            folioFrom,
            folioTo,
            customer?.Trim(),
            warehouse,
            status?.Trim(),
            fiscalMethod?.Trim(),
            paymentConcept
        );

        var result = await summaryProbe.ReadAsync(
            request.ToProfile(),
            request.Password,
            from,
            to,
            filters,
            cancellationToken
        );

        return Ok(result);
    }
}
