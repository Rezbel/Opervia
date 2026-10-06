using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Receivables;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/receivables/invoice-account/{documentNumber}")]
public sealed class SaeReceivableInvoiceAccountController(ISaeReceivableInvoiceAccountProbe probe) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<SaeReceivableInvoiceAccountResult>> ReadAsync(string documentNumber,
        [FromBody] TestSaeConnectionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(documentNumber) || documentNumber.Trim().Length > 20)
            return BadRequest(new { message = "Indica una clave de factura válida." });
        return Ok(await probe.ReadAsync(request.ToProfile(), request.Password, documentNumber, cancellationToken));
    }
}
