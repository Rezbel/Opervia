using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Access;

namespace Opervia.Infrastructure.Firebird;

internal static class FirebirdSellerCatalog
{
    public static async Task<Dictionary<string, string>> ReadAsync(FbConnection connection, string table,
        CancellationToken token, bool unrestricted = false)
    {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        await using var command = new FbCommand($"SELECT CVE_VEND,NOMBRE FROM {table} WHERE {(unrestricted ? "1=1" : SellerAccessScope.Sql("CVE_VEND"))}", connection) { CommandTimeout = 20 };
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            var code = reader.IsDBNull(0) ? "" : reader.GetString(0).Trim();
            var name = reader.IsDBNull(1) ? "" : reader.GetString(1).Trim();
            if (code.Length > 0) names[code] = name;
        }
        return names;
    }
}
