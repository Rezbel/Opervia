using Microsoft.AspNetCore.Mvc;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Opervia.Api.Contracts.ArtificialIntelligence;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.ArtificialIntelligence;

namespace Opervia.Api.Controllers;

[ApiController]
[Route("api/ai")]
public sealed class OperviaAiController(
    IOperviaAiAssistant assistant,
    IOperviaAiEvidenceProbe evidenceProbe)
    : ControllerBase
{
    [HttpPost("ask")]
    public async Task<ActionResult<OperviaAiAnswer>> AskAsync(
        [FromBody] AskOperviaAiRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return BadRequest(new { message = "Escribe una pregunta para Opervia AI." });
        if (request.Question.Length > 1000)
            return BadRequest(new { message = "La pregunta no puede exceder 1,000 caracteres." });
        if (!assistant.IsConfigured)
            return Problem(statusCode: 503, title: "Opervia AI no está configurado",
                detail: "Configura y enciende el proveedor local de inteligencia artificial.");

        try
        {
            var evidence = await evidenceProbe.ReadAsync(
                request.Connection.ToProfile(),
                request.Connection.Password,
                request.Question,
                cancellationToken);
            var directAnswer = TryCreateDirectAnswer(
                request.Question,
                evidence);
            if (directAnswer is not null)
                return Ok(directAnswer);

            var assistantRequest = new OperviaAiRequest(
                request.Question,
                request.CompanyLabel,
                request.Flow,
                request.DocumentItems,
                evidence);
            return Ok(await assistant.AskAsync(
                assistantRequest,
                cancellationToken));
        }
        catch (OperviaAiUnavailableException exception)
        {
            return Problem(statusCode: 503, title: "Opervia AI no está disponible",
                detail: exception.Message);
        }
    }

    private static OperviaAiAnswer? TryCreateDirectAnswer(
        string question,
        string evidence)
    {
        using var document = JsonDocument.Parse(evidence);
        var root = document.RootElement;
        var normalized = RemoveDiacritics(question).ToLowerInvariant();

        if (normalized.Contains("detalle", StringComparison.Ordinal) &&
            normalized.Contains("factura", StringComparison.Ordinal))
            return CreateInvoiceDetailAnswer(root);

        if (ContainsAny(normalized, "ultima venta", "ultimo venta", "ultima factura"))
            return CreateLatestInvoiceAnswer(normalized, root);

        if (ContainsAny(normalized, "stock", "existencia", "existencias"))
            return CreateStockAnswer(root);

        return null;
    }

    private static OperviaAiAnswer CreateInvoiceDetailAnswer(
        JsonElement evidence)
    {
        var invoices = evidence.GetProperty("selectedInvoice")
            .EnumerateArray()
            .ToArray();
        var items = evidence.GetProperty("invoiceItems")
            .EnumerateArray()
            .ToArray();

        if (invoices.Length == 0)
        {
            return new OperviaAiAnswer(
                "No encontré esa factura en SAE. Verifica que el número esté escrito completo, incluyendo su serie.",
                "Factura no encontrada",
                ["No se inventaron datos ni se utilizó una factura similar."],
                ["¿Cuál fue la última venta vigente del cliente 520?"],
                "Consulta directa · SAE");
        }

        var invoice = invoices[0];
        var invoiceNumber = GetText(invoice, "invoiceNumber") ?? "Sin número";
        var customer = GetText(invoice, "customer") ?? "Cliente sin nombre";
        var customerCode = GetText(invoice, "customerCode") ?? "Sin clave";
        var date = FormatDate(GetText(invoice, "documentDate"));
        var amount = invoice.GetProperty("amountWithTax").GetDecimal();
        var isCanceled = invoice.GetProperty("isCanceled").GetBoolean();

        if (items.Length == 0)
        {
            return new OperviaAiAnswer(
                $"Encontré la factura {invoiceNumber}, del {date}, por {FormatMoney(amount)} con IVA, para {customer} (cliente {customerCode}); sin embargo, SAE no devolvió sus partidas.",
                $"Factura {invoiceNumber} encontrada sin partidas",
                ["No fue posible consultar el detalle de productos de esta factura."],
                [$"¿Puedes confirmar el estado de la factura {invoiceNumber}?"],
                "Consulta directa · SAE");
        }

        var lines = items.Take(15).Select(item =>
        {
            var code = GetText(item, "productCode") ?? "Sin clave";
            var description = GetText(item, "description") ?? "Sin descripción";
            var quantity = item.GetProperty("quantity").GetDecimal();
            var unit = GetText(item, "unit");
            var lineTotal = item.GetProperty("totalWithTax").GetDecimal();
            return $"• {code} — {description}: {quantity:N2}{(string.IsNullOrWhiteSpace(unit) ? string.Empty : $" {unit}")} · {FormatMoney(lineTotal)}";
        });
        var status = isCanceled ? "Cancelada" : "Vigente";
        var answer = $"Factura {invoiceNumber}\nCliente: {customer} ({customerCode})\nFecha: {date}\nEstado: {status}\nTotal con IVA: {FormatMoney(amount)}\n\nPartidas:\n{string.Join("\n", lines)}";

        return new OperviaAiAnswer(
            answer,
            $"{items.Length} {(items.Length == 1 ? "partida" : "partidas")} · {FormatMoney(amount)}",
            isCanceled ? ["La factura está cancelada en SAE."] : [],
            [
                $"¿En qué almacenes están los productos de la factura {invoiceNumber}?",
                $"¿Cuál fue la última venta vigente del cliente {customerCode}?"
            ],
            "Consulta directa · SAE");
    }

    private static OperviaAiAnswer CreateLatestInvoiceAnswer(
        string question,
        JsonElement evidence)
    {
        var invoices = evidence.GetProperty("recentInvoices")
            .EnumerateArray()
            .ToArray();
        var onlyActive = ContainsAny(
            question, "vigente", "cerrada", "no cancelada", "activa");
        var selected = invoices.FirstOrDefault(invoice =>
            !onlyActive ||
            !invoice.GetProperty("isCanceled").GetBoolean());

        if (selected.ValueKind == JsonValueKind.Undefined)
        {
            var unavailable = evidence.GetProperty("unavailableAreas")
                .EnumerateArray()
                .Any(item => item.GetString()?.Contains(
                    "facturas", StringComparison.OrdinalIgnoreCase) == true);
            return new OperviaAiAnswer(
                unavailable
                    ? "No pude consultar las facturas de esta empresa SAE en este momento."
                    : "No encontré una factura que coincida con ese cliente. Verifica la clave o escribe parte del nombre comercial.",
                unavailable
                    ? "La consulta de facturas no estuvo disponible"
                    : "No se encontró una venta para ese cliente",
                unavailable
                    ? ["La base no devolvió el área de facturación."]
                    : ["No se inventaron datos: la búsqueda regresó sin coincidencias."],
                [
                    "¿Cuál fue la última venta vigente del cliente 520?",
                    "¿Hay facturas canceladas del cliente 520?"
                ],
                "Consulta directa · SAE");
        }

        var invoiceNumber = GetText(selected, "invoiceNumber") ?? "Sin número";
        var customer = GetText(selected, "customer") ?? "Cliente sin nombre";
        var customerCode = GetText(selected, "customerCode") ?? "Sin clave";
        var date = FormatDate(GetText(selected, "documentDate"));
        var amount = selected.GetProperty("amountWithTax").GetDecimal();
        var isCanceled = selected.GetProperty("isCanceled").GetBoolean();
        var status = isCanceled ? "cancelada" : "vigente";

        return new OperviaAiAnswer(
            $"La última venta {status} encontrada es la factura {invoiceNumber}, emitida el {date} por {FormatMoney(amount)} con IVA. Corresponde a {customer} (cliente {customerCode}).",
            $"Factura {invoiceNumber} · {FormatMoney(amount)}",
            isCanceled
                ? ["La factura está cancelada en SAE."]
                : [],
            [
                $"¿Cuál es el detalle de la factura {invoiceNumber}?",
                $"¿Cuánto ha comprado el cliente {customerCode}?"
            ],
            "Consulta directa · SAE");
    }

    private static OperviaAiAnswer CreateStockAnswer(JsonElement evidence)
    {
        var products = evidence.GetProperty("products")
            .EnumerateArray()
            .ToArray();
        if (products.Length == 0)
        {
            return new OperviaAiAnswer(
                "No encontré productos que coincidan con esa descripción o clave. Escribe una clave exacta o una parte más específica del nombre.",
                "No se encontraron productos",
                ["La consulta regresó sin coincidencias; no se estimaron existencias."],
                [
                    "¿Cuánto stock hay del producto con clave ___?",
                    "¿Qué productos tienen existencia negativa?"
                ],
                "Consulta directa · SAE");
        }

        if (products.Length == 1)
        {
            var product = products[0];
            var code = GetText(product, "productCode") ?? "Sin clave";
            var description = GetText(product, "description") ?? "Sin descripción";
            var stock = product.GetProperty("totalStock").GetDecimal();
            var unit = GetText(product, "unit");
            var warehouses = evidence.GetProperty("stockByWarehouse")
                .EnumerateArray()
                .Where(item => string.Equals(
                    GetText(item, "productCode"), code,
                    StringComparison.OrdinalIgnoreCase))
                .Select(item =>
                    $"{GetText(item, "warehouse")}: {item.GetProperty("stock").GetDecimal():N2}")
                .ToArray();
            var detail = warehouses.Length > 0
                ? $" Por almacén: {string.Join("; ", warehouses)}."
                : string.Empty;
            return new OperviaAiAnswer(
                $"{description} ({code}) tiene una existencia global de {stock:N2}{(string.IsNullOrWhiteSpace(unit) ? string.Empty : $" {unit}")}.{detail}",
                $"Existencia disponible: {stock:N2}",
                stock < 0 ? ["La existencia global es negativa."] : [],
                [
                    $"¿Cuál fue la última venta del producto {code}?",
                    $"¿En qué almacén hay más stock del producto {code}?"
                ],
                "Consulta directa · SAE");
        }

        var choices = products
            .Take(6)
            .Select(product =>
                $"{GetText(product, "productCode")} — {GetText(product, "description")} ({product.GetProperty("totalStock").GetDecimal():N2})")
            .ToArray();
        return new OperviaAiAnswer(
            $"Encontré varios productos. Indícame la clave exacta para darte su existencia por almacén: {string.Join("; ", choices)}.",
            $"Se encontraron {products.Length} coincidencias",
            ["La descripción es ambigua; se necesita una clave para evitar mostrar el producto equivocado."],
            choices.Take(3)
                .Select(choice => $"¿Cuánto stock hay del producto {choice.Split(' ')[0]}?")
                .ToArray(),
            "Consulta directa · SAE");
    }

    private static string? GetText(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) &&
        value.ValueKind != JsonValueKind.Null
            ? value.GetString()
            : null;

    private static string FormatDate(string? value) =>
        DateTime.TryParse(value, out var date)
            ? date.ToString("dd MMM yyyy", CultureInfo.GetCultureInfo("es-MX"))
            : "fecha no disponible";

    private static string FormatMoney(decimal value) =>
        value.ToString("C2", CultureInfo.GetCultureInfo("es-MX"));

    private static bool ContainsAny(string value, params string[] terms) =>
        terms.Any(term => value.Contains(term, StringComparison.Ordinal));

    private static string RemoveDiacritics(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        return new string(normalized
            .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) !=
                UnicodeCategory.NonSpacingMark)
            .ToArray())
            .Normalize(NormalizationForm.FormC);
    }
}
