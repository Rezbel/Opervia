using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Opervia.Application.ArtificialIntelligence;

namespace Opervia.Infrastructure.ArtificialIntelligence;

public sealed class OllamaOperviaAssistant(
    HttpClient client,
    IOptions<OllamaOptions> options
) : IOperviaAiAssistant
{
    private readonly OllamaOptions _settings = options.Value;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_settings.Endpoint) &&
        !string.IsNullOrWhiteSpace(_settings.Model);

    public async Task<OperviaAiAnswer> AskAsync(
        OperviaAiRequest request,
        CancellationToken cancellationToken)
    {
        var schema = new
        {
            type = "object",
            additionalProperties = false,
            properties = new
            {
                answer = new { type = "string" },
                summary = new { type = "string" },
                alerts = new
                {
                    type = "array",
                    items = new { type = "string" }
                },
                suggestedQuestions = new
                {
                    type = "array",
                    items = new { type = "string" }
                }
            },
            required = new[]
            {
                "answer", "summary", "alerts", "suggestedQuestions"
            }
        };

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
            stream = false,
            think = false,
            keep_alive = "10m",
            format = schema,
            options = new
            {
                temperature = 0,
                num_ctx = 4096,
                num_predict = 650
            },
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content =
                        "Eres Opervia AI, analista de Aspel SAE con acceso exclusivamente de lectura. Responde en español claro usando sólo la evidencia SAE proporcionada. Puedes contestar sobre existencias, productos, almacenes, clientes, ventas, facturas y el flujo seleccionado. Nunca inventes datos ni afirmes que modificaste SAE. Distingue documentos vigentes de cancelados y valores con IVA de valores sin IVA. Si hay varios resultados posibles, enuméralos brevemente; si no hay evidencia suficiente, dilo y pide una clave o nombre más preciso. No muestres ni sugieras SQL. Devuelve solamente el JSON solicitado."
                },
                new
                {
                    role = "user",
                    content =
                        $"Pregunta: {request.Question}\nEvidencia SAE:\n{evidence}\nEsquema requerido:\n{JsonSerializer.Serialize(schema)}"
                }
            }
        };

        try
        {
            using var response = await client.PostAsJsonAsync(
                _settings.Endpoint,
                payload,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new OperviaAiUnavailableException(
                    $"Ollama no pudo responder (HTTP {(int)response.StatusCode}).");
            }

            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken),
                cancellationToken: cancellationToken);
            var content = document.RootElement
                .GetProperty("message")
                .GetProperty("content")
                .GetString();
            var parsed = JsonSerializer.Deserialize<AiResponse>(
                content ?? "",
                new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                })
                ?? throw new JsonException("Ollama devolvió una respuesta vacía.");

            return new(
                parsed.Answer,
                parsed.Summary,
                parsed.Alerts,
                parsed.SuggestedQuestions,
                $"Local · {_settings.Model}");
        }
        catch (OperationCanceledException) when (
            !cancellationToken.IsCancellationRequested)
        {
            throw new OperviaAiUnavailableException(
                "La IA local tardó demasiado en responder. Intenta una pregunta más específica.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (OperviaAiUnavailableException)
        {
            throw;
        }
        catch (HttpRequestException exception)
        {
            throw new OperviaAiUnavailableException(
                "La IA local no está disponible. Verifica que Ollama esté encendido.",
                exception);
        }
        catch (Exception exception)
        {
            throw new OperviaAiUnavailableException(
                "La IA local no pudo interpretar la respuesta. Vuelve a intentar.",
                exception);
        }
    }

    private sealed record AiResponse(
        string Answer,
        string Summary,
        string[] Alerts,
        string[] SuggestedQuestions);
}
