using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Connections;
using Opervia.Application.Commercial;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdAccessCatalog
{
    public async Task<SaeCommercialOption[]> SellersAsync(SavedSaeConnectionProfile saved, CancellationToken token)
    {
        var profile = new Opervia.Domain.Connections.SaeConnectionProfile { DisplayName = saved.DisplayName, Host = saved.Host, Port = saved.Port, Database = saved.Database, Username = saved.Username, CompanyNumber = saved.CompanyNumber, SaeVersion = saved.SaeVersion, Charset = saved.Charset };
        await using var connection = FirebirdConnectionFactory.Create(profile, saved.Password);
        await connection.OpenAsync(token);
        var names = await FirebirdSellerCatalog.ReadAsync(connection, profile.ResolveTableName("VEND"), token, unrestricted: true);
        return names.OrderBy(row => row.Key, StringComparer.OrdinalIgnoreCase).Select(row => new SaeCommercialOption(row.Key, row.Value)).ToArray();
    }
}
