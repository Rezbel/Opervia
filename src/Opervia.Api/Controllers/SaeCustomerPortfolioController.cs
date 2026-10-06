using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Customers;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/customers/portfolio")]
public sealed class SaeCustomerPortfolioController(
    ISaeCustomerPortfolioProbe probe
) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeCustomerPortfolioResult>> ReadAsync(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? seller,
        [FromQuery] string? branch,
        [FromQuery] string? state,
        [FromQuery] string? customerType,
        [FromQuery] string? classification,
        [FromQuery] string? credit,
        [FromQuery] string? customer,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken)
    {
        if (from == default || to == default || to < from || to.DayNumber - from.DayNumber > 366)
            return BadRequest(new { message = "Indica un periodo válido de hasta 367 días." });

        static bool ValidCode(string? value, string codes) => string.IsNullOrWhiteSpace(value) ||
            (value.Trim().Length == 1 && codes.Contains(value.Trim().ToUpperInvariant(), StringComparison.Ordinal));
        if (!ValidCode(branch, "QHXS") || !ValidCode(state, "AMSB") || !ValidCode(customerType, "LIDHCEV") ||
            !ValidCode(classification, "AROX") || !ValidCode(credit, "012345") ||
            seller?.Trim().Length > 10 || customer?.Trim().Length > 10)
            return BadRequest(new { message = "Revisa las claves y opciones de los filtros de clientes." });

        var filter = new SaeCustomerPortfolioFilter(
            seller, branch, state, customerType, classification, credit, customer);
        return Ok(await probe.ReadAsync(request.ToProfile(), request.Password, from, to, filter, cancellationToken));
    }
}
