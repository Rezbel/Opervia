namespace Opervia.Application.Access;

// The API supplies this scope from the authenticated account, never from a request body.
public static class SellerAccessScope
{
    private static readonly AsyncLocal<string[]?> Value = new();
    public static string[]? Sellers { get => Value.Value; set => Value.Value = value; }
    public static bool IsRestricted => Sellers is not null;
    public static bool Allows(string? seller) => Sellers is null || Sellers.Contains(seller?.Trim(), StringComparer.OrdinalIgnoreCase);
    public static string Sql(string expression) => Sellers is null ? "1 = 1" : Sellers.Length == 0 ? "1 = 0"
        : $"UPPER(TRIM({expression})) IN ({string.Join(",", Sellers.Select(s => "'" + s.ToUpperInvariant().Replace("'", "''") + "'"))})";
}
