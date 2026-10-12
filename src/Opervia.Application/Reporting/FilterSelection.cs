using System.Text.Json;
namespace Opervia.Application.Reporting;
public static class FilterSelection
{
    public static string[] Values(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];
        var text = value.Trim();
        if (!text.StartsWith('[')) return [text];
        try { return (JsonSerializer.Deserialize<string[]>(text) ?? []).Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(); }
        catch (JsonException) { return [text]; }
    }
    public static bool Matches(string? selection, string? value) => Values(selection) is var values &&
        (values.Length == 0 || values.Contains(value?.Trim() ?? "", StringComparer.OrdinalIgnoreCase));
}
