using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Opervia.Application.Receivables;

public sealed record ReceivableInvoiceSearchText(string Invoice, string CustomerCode, string CustomerName, string LegalName);

public static partial class ReceivableInvoiceSearch
{
    // Normalize once per document, match every query word, then prioritize identifiers and prefixes.
    public static IReadOnlyList<int> Find(IReadOnlyList<ReceivableInvoiceSearchText> documents, string? query)
    {
        var normalized = Normalize(query ?? string.Empty);
        if (normalized.Length == 0) return string.IsNullOrWhiteSpace(query) ? Enumerable.Range(0, documents.Count).ToArray() : [];
        var tokens = normalized.Split(' ').Distinct().Select(word => (Word: word, Key: Identifier(word))).ToArray();
        var key = Identifier(normalized);
        var matches = new List<(int Index, int Score)>();
        for (var i = 0; i < documents.Count; i++)
        {
            var row = documents[i];
            var invoice = Identifier(row.Invoice);
            var customer = Identifier(row.CustomerCode);
            var name = Normalize(row.CustomerName + " " + row.LegalName);
            var nameWords = name.Split(' ');
            if (!tokens.All(token => invoice.Contains(token.Key, StringComparison.Ordinal) ||
                customer.Contains(token.Key, StringComparison.Ordinal) || name.Contains(token.Word, StringComparison.Ordinal))) continue;
            var score = invoice == key ? 0 : customer == key ? 1 :
                invoice.StartsWith(key, StringComparison.Ordinal) ? 10 : customer.StartsWith(key, StringComparison.Ordinal) ? 12 :
                name.StartsWith(normalized, StringComparison.Ordinal) ? 20 : name.Contains(normalized, StringComparison.Ordinal) ? 30 :
                tokens.All(token => nameWords.Any(word => word.StartsWith(token.Word, StringComparison.Ordinal))) ? 40 : 60;
            matches.Add((i, score));
        }
        return matches.OrderBy(match => match.Score).ThenBy(match => match.Index).Select(match => match.Index).ToArray();
    }

    private static string Normalize(string value)
    {
        var result = new StringBuilder();
        foreach (var character in value.Normalize(NormalizationForm.FormD).ToUpperInvariant())
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(character)) result.Append(character);
            else if (result.Length > 0 && result[^1] != ' ') result.Append(' ');
        }
        return result.ToString().Trim();
    }

    private static string Identifier(string value) => Digits().Replace(Normalize(value).Replace(" ", ""),
        match => match.Value.TrimStart('0') is { Length: > 0 } number ? number : "0");

    [GeneratedRegex("[0-9]+", RegexOptions.NonBacktracking)]
    private static partial Regex Digits();
}
