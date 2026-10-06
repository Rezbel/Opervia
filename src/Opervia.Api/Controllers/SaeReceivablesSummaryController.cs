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
            [FromQuery] string? invoiceSearch,
            [FromBody] TestSaeConnectionRequest request,
            CancellationToken cancellationToken,
            [FromQuery] int invoicePage = 1,
            [FromQuery] int invoicePageSize = 10,
            [FromQuery] bool includeInvoices = true
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

        if (invoicePage < 1 || invoicePageSize is < 1 or > 100)
        {
            return BadRequest(new { message = "La página debe ser positiva y el tamaño debe estar entre 1 y 100." });
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
            paymentConcept,
            invoiceSearch?.Trim()
        );

        var result = await summaryProbe.ReadAsync(
            request.ToProfile(),
            request.Password,
            from,
            to,
            filters,
            invoicePage,
            invoicePageSize,
            cancellationToken,
            includeInvoices
        );

        return Ok(result);
    }
}
