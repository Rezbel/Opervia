using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Commercial;
namespace Opervia.Api.Controllers;
[ApiController, Route("api/sae/commercial")]
public sealed class SaeCommercialController(ISaeCommercialProbe probe) : ControllerBase {
 [HttpPost] public async Task<ActionResult<SaeCommercialResult>> ReadAsync([FromQuery] DateOnly from,[FromQuery] DateOnly to,[FromQuery] string? seller,[FromQuery] string? brand,[FromQuery] string? line,[FromQuery] string? customer,[FromBody] TestSaeConnectionRequest request,CancellationToken cancellationToken) {
  if (from == default || to == default || to < from || to.DayNumber - from.DayNumber > 366) return BadRequest(new { message = "Indica un periodo válido de hasta 367 días." });
  return Ok(await probe.ReadAsync(request.ToProfile(),request.Password,from,to,new(seller,brand,line,customer),cancellationToken));
 }
 [HttpPost("customer-products")]
 public async Task<ActionResult<SaeCommercialCustomerPurchasesResult>> ReadCustomerProductsAsync(
  [FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] string? seller,
  [FromQuery] string? brand, [FromQuery] string? line, [FromQuery] string? customer,
  [FromBody] TestSaeConnectionRequest request, CancellationToken cancellationToken) {
  if (from == default || to == default || to < from || to.DayNumber - from.DayNumber > 366)
   return BadRequest(new { message = "Indica un periodo válido de hasta 367 días." });
  if (string.IsNullOrWhiteSpace(customer) || customer.Trim().Length > 20)
   return BadRequest(new { message = "Selecciona un cliente válido para consultar sus productos." });
  return Ok(await probe.ReadCustomerPurchasesAsync(request.ToProfile(), request.Password, from, to,
   new(seller, brand, line, customer), cancellationToken));
 }
}
