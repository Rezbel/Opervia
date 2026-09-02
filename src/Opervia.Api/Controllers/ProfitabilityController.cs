using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Profitability;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/sae/profitability")]
public sealed class ProfitabilityController(
    ISaeProfitabilityProbe saeProbe
) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ProfitabilityDashboardResult>> ReadAsync(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? branch,
        [FromQuery] string? seller,
        [FromBody] TestSaeConnectionRequest request,
        CancellationToken cancellationToken)
    {
        if (from == default || to == default || to < from)
            return BadRequest(new { message = "Indica un periodo de consulta válido." });
        if (to.DayNumber - from.DayNumber > 1096)
            return BadRequest(new { message = "La rentabilidad admite periodos de hasta tres años." });

        branch = string.IsNullOrWhiteSpace(branch) ? null : branch.Trim();
        seller = string.IsNullOrWhiteSpace(seller) ? null : seller.Trim();

        var sae = await saeProbe.ReadAsync(request.ToProfile(), request.Password,
            from, to, branch, seller, cancellationToken);
        var warnings = new List<string>
        {
            "Este reporte automático usa exclusivamente datos leídos desde SAE. Los ajustes manuales se muestran aparte."
        };

        var grossProfit = sae.NetSalesWithoutTax - sae.CostOfSales;
        var grossMargin = sae.NetSalesWithoutTax == 0 ? 0 : grossProfit / sae.NetSalesWithoutTax * 100;

        return Ok(new ProfitabilityDashboardResult(
            true,
            "Rentabilidad calculada exclusivamente con SAE en vivo.",
            from, to, branch, seller,
            sae.NetSalesWithoutTax,
            sae.NetSalesWithTax,
            sae.CostOfSales,
            sae.PurchasesWithoutTax,
            sae.PurchasesWithTax,
            sae.PurchaseCount,
            grossProfit,
            grossMargin,
            sae.InvoiceCount,
            sae.InvoiceCount == 0 ? 0 : sae.NetSalesWithoutTax / sae.InvoiceCount,
            sae.Monthly,
            sae.Branches,
            sae.Sellers,
            sae.BranchOptions,
            sae.SellerOptions,
            new ProfitabilitySourceInfo(
                "SOLO LECTURA · SELECT",
                sae.InvoiceTableName,
                sae.InvoiceLinesTableName,
                sae.PurchaseTableName),
            warnings,
            sae.ElapsedMilliseconds
        ));
    }
}
