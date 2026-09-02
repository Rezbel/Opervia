namespace Opervia.Infrastructure.ArtificialIntelligence;

public sealed class OllamaOptions
{
    public const string SectionName = "Ollama";
    public string Endpoint { get; init; } =
        "http://127.0.0.1:11434/api/chat";
    public string Model { get; init; } = "qwen3:4b";
}
