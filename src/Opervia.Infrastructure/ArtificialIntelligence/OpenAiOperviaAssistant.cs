using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Opervia.Application.ArtificialIntelligence;

namespace Opervia.Infrastructure.ArtificialIntelligence;

public sealed class OpenAiOperviaAssistant(
    HttpClient client,
    IOptions<OpenAiOptions> options
) : IOperviaAiAssistant
{
    private readonly OpenAiOptions _settings = options.Value;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_settings.ApiKey);

    public async Task<OperviaAiAnswer> AskAsync(
        OperviaAiRequest request,
        CancellationToken cancellationToken
    )
    {
        if (!IsConfigured)
            throw new OperviaAiUnavailableException(
                "Opervia AI todavía no tiene una clave configurada.");

        var evidence = JsonSerializer.Serialize(new
        {
            company = request.CompanyLabel,
            flow = request.Flow,
            selectedDocumentItems = request.DocumentItems,
            saeLiveData = JsonSerializer.Deserialize<JsonElement>(
                request.SaeEvidence)
        });
        var payload = new
        {
            model = _settings.Model,
            store = false,
            reasoning = new { effort = "low" },
            instructions =
                "Eres Opervia AI, analista de Aspel SAE con acceso exclusivamente de lectura. Responde en español claro usando sólo la evidencia SAE proporcionada. Puedes contestar sobre existencias, productos, almacenes, clientes, ventas, facturas y el flujo seleccionado. Nunca inventes datos ni afirmes que modificaste SAE. Distingue documentos vigentes de cancelados y valores con IVA de valores sin IVA. Si hay varios resultados posibles, enuméralos brevemente; si no hay evidencia suficiente, dilo y pide una clave o nombre más preciso. No muestres ni sugieras SQL. Devuelve solamente el JSON solicitado.",
            input = $"Pregunta: {request.Question}\nEvidencia SAE:\n{evidence}",
            text = new
            {
                verbosity = "medium",
                format = new
                {
                    type = "json_schema",
                    name = "opervia_answer",
                    strict = true,
                    schema = new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            answer = new { type = "string" },
                            summary = new { type = "string" },
                            alerts = new { type = "array", items = new { type = "string" } },
                            suggestedQuestions = new { type = "array", items = new { type = "string" } }
                        },
                        required = new[] { "answer", "summary", "alerts", "suggestedQuestions" }
                    }
                }
            }
        };

        using var message = new HttpRequestMessage(HttpMethod.Post, _settings.Endpoint);
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey);
        message.Content = JsonContent.Create(payload);

        try
        {
            using var response = await client.SendAsync(message, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(
                    cancellationToken);
                var errorCode = ExtractErrorCode(errorBody);

                throw new OperviaAiUnavailableException(
                    CreateSafeErrorMessage(
                        (int)response.StatusCode,
                        errorCode));
            }

            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken),
                cancellationToken: cancellationToken);
            var text = ExtractText(document.RootElement);
            var parsed = JsonSerializer.Deserialize<AiResponse>(text,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new JsonException("Respuesta vacía.");

            return new(parsed.Answer, parsed.Summary, parsed.Alerts,
                parsed.SuggestedQuestions, _settings.Model);
        }
        catch (OperationCanceledException) { throw; }
        catch (OperviaAiUnavailableException) { throw; }
        catch (Exception exception)
        {
            throw new OperviaAiUnavailableException(
                "No fue posible obtener una respuesta de Opervia AI.", exception);
        }
    }

    private static string ExtractText(JsonElement root)
    {
        if (root.TryGetProperty("output_text", out var direct))
            return direct.GetString() ?? "";

        foreach (var output in root.GetProperty("output").EnumerateArray())
        {
            if (!output.TryGetProperty("content", out var content)) continue;
            foreach (var item in content.EnumerateArray())
                if (item.TryGetProperty("type", out var type) &&
                    type.GetString() == "output_text" &&
                    item.TryGetProperty("text", out var text))
                    return text.GetString() ?? "";
        }
        throw new JsonException("OpenAI no devolvió texto.");
    }

    private static string? ExtractErrorCode(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement
                .GetProperty("error")
                .GetProperty("code")
                .GetString();
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
        catch (KeyNotFoundException)
        {
            return null;
        }
    }

    private static string CreateSafeErrorMessage(
        int statusCode,
        string? errorCode)
    {
        if (statusCode == 429 &&
            string.Equals(
                errorCode,
                "insufficient_quota",
                StringComparison.OrdinalIgnoreCase))
        {
            return "La cuenta de OpenAI no tiene saldo disponible o alcanzó su límite mensual. Activa la facturación o agrega crédito y vuelve a intentar.";
        }

        return statusCode switch
        {
            429 =>
                "OpenAI alcanzó temporalmente el límite de solicitudes. Espera unos segundos y vuelve a intentar.",
            401 =>
                "OpenAI rechazó la clave API. Crea o configura una clave válida.",
            403 =>
                "La clave API no tiene permiso para usar Responses. Revisa sus permisos.",
            404 =>
                "El modelo configurado no está disponible para este proyecto de OpenAI.",
            _ =>
                $"OpenAI no pudo responder (HTTP {statusCode})."
        };
    }

    private sealed record AiResponse(
        string Answer, string Summary, string[] Alerts,
        string[] SuggestedQuestions);
}
