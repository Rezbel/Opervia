namespace Opervia.Infrastructure.ArtificialIntelligence;

public sealed class OpenAiOptions
{
    public const string SectionName = "OpenAI";
    public string ApiKey { get; init; } = "";
    public string Model { get; init; } = "gpt-5.6-terra";
    public string Endpoint { get; init; } =
        "https://api.openai.com/v1/responses";
}
