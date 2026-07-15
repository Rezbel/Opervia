using FirebirdSql.Data.FirebirdClient;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

internal static class FirebirdConnectionFactory
{
    public static FbConnection Create(
        SaeConnectionProfile profile,
        string password
    )
    {
        ArgumentNullException.ThrowIfNull(profile);

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException(
                "La contraseña de Firebird es obligatoria.",
                nameof(password)
            );
        }

        var connectionString = new FbConnectionStringBuilder
        {
            DataSource = profile.Host,
            Port = profile.Port,
            Database = profile.Database,
            UserID = profile.Username,
            Password = password,
            Charset = profile.Charset,
            Pooling = false,
            ConnectionTimeout = 8
        }.ToString();

        return new FbConnection(connectionString);
    }
}
