using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Receivables;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/receivables/customer")]
public sealed class SaeCustomerReceivablesController : ControllerBase
{
    private readonly ISaeCustomerReceivableMovementsProbe
        _movementsProbe;

    public SaeCustomerReceivablesController(
        ISaeCustomerReceivableMovementsProbe movementsProbe
    )
    {
        _movementsProbe = movementsProbe;
    }

    [HttpPost("{customerCode}/recent")]
    public async Task<
        ActionResult<SaeCustomerReceivableMovementsResult>
    > ReadAsync(
        string customerCode,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken
    )
    {
        var profile = request.ToProfile();

        var result = await _movementsProbe.ReadAsync(
            profile,
            request.Password,
            customerCode,
            cancellationToken
        );

        return Ok(result);
    }
}
