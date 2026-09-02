using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;
using MySqlConnector;
using Opervia.Application.Connections;

namespace Opervia.Infrastructure.Persistence;

public sealed class MySqlSaeConnectionProfileStore(
    IOptions<MySqlStorageOptions> options,
    IDataProtectionProvider protectionProvider
) : ISaeConnectionProfileStore
{
    private readonly string _connectionString =
        options.Value.ConnectionString;
    private readonly IDataProtector _protector =
        protectionProvider.CreateProtector(
            "Opervia.SaeConnectionPasswords.v1");

    public async Task<IReadOnlyList<SavedSaeConnectionSummary>> ListAsync(
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, display_name, host_name, port, database_path,
                   user_name, company_number, sae_version, charset_name,
                   updated_at_utc
            FROM sae_connection_profiles
            ORDER BY COALESCE(last_used_at_utc, updated_at_utc) DESC;
            """;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var results = new List<SavedSaeConnectionSummary>();
        while (await reader.ReadAsync(cancellationToken))
            results.Add(ReadSummary(reader));
        return results;
    }

    public async Task<SavedSaeConnectionProfile?> GetAsync(
        Guid id, bool markAsUsed, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        var result = await ReadProfileAsync(connection, id, cancellationToken);
        if (result is not null && markAsUsed)
        {
            await using var update = connection.CreateCommand();
            update.CommandText =
                "UPDATE sae_connection_profiles SET last_used_at_utc = UTC_TIMESTAMP(6) WHERE id = @id;";
            update.Parameters.AddWithValue("@id", id.ToString("D"));
            await update.ExecuteNonQueryAsync(cancellationToken);
        }
        return result;
    }

    public async Task<SavedSaeConnectionProfile?> GetLastUsedAsync(
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id FROM sae_connection_profiles
            ORDER BY COALESCE(last_used_at_utc, updated_at_utc) DESC
            LIMIT 1;
            """;
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is null
            ? null
            : await ReadProfileAsync(
                connection, ToGuid(value), cancellationToken);
    }

    public async Task<SavedSaeConnectionSummary> SaveAsync(
        SavedSaeConnectionProfile profile,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        var fingerprint = Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes(
                $"{profile.Host.Trim().ToUpperInvariant()}|{profile.Port}|{profile.Database.Trim().ToUpperInvariant()}|{profile.Username.Trim().ToUpperInvariant()}|{profile.CompanyNumber.Trim()}")));
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO sae_connection_profiles
              (id, fingerprint, display_name, host_name, port, database_path,
               user_name, protected_password, company_number, sae_version,
               charset_name, created_at_utc, updated_at_utc, last_used_at_utc)
            VALUES
              (@id, @fingerprint, @displayName, @host, @port, @database,
               @username, @password, @company, @version, @charset,
               UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
            ON DUPLICATE KEY UPDATE
              display_name = VALUES(display_name),
              protected_password = VALUES(protected_password),
              sae_version = VALUES(sae_version),
              charset_name = VALUES(charset_name),
              updated_at_utc = UTC_TIMESTAMP(6),
              last_used_at_utc = UTC_TIMESTAMP(6);
            """;
        AddParameters(command, profile, fingerprint);
        await command.ExecuteNonQueryAsync(cancellationToken);

        await using var idCommand = connection.CreateCommand();
        idCommand.CommandText =
            "SELECT id FROM sae_connection_profiles WHERE fingerprint = @fingerprint;";
        idCommand.Parameters.AddWithValue("@fingerprint", fingerprint);
        var savedId = ToGuid(
            (await idCommand.ExecuteScalarAsync(cancellationToken))!);
        return (await GetSummaryAsync(connection, savedId, cancellationToken))!;
    }

    public async Task<bool> DeleteAsync(
        Guid id, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM sae_connection_profiles WHERE id = @id;";
        command.Parameters.AddWithValue("@id", id.ToString("D"));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    private async Task<MySqlConnection> OpenAsync(CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
            throw new InvalidOperationException(
                "MySQL no está configurado para Opervia.");
        var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(token);
        return connection;
    }

    private static async Task EnsureSchemaAsync(
        MySqlConnection connection, CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS sae_connection_profiles (
              id CHAR(36) NOT NULL PRIMARY KEY,
              fingerprint CHAR(64) NOT NULL UNIQUE,
              display_name VARCHAR(120) NOT NULL,
              host_name VARCHAR(255) NOT NULL,
              port INT NOT NULL,
              database_path VARCHAR(1024) NOT NULL,
              user_name VARCHAR(120) NOT NULL,
              protected_password TEXT NOT NULL,
              company_number VARCHAR(20) NOT NULL,
              sae_version VARCHAR(20) NOT NULL,
              charset_name VARCHAR(40) NOT NULL,
              created_at_utc DATETIME(6) NOT NULL,
              updated_at_utc DATETIME(6) NOT NULL,
              last_used_at_utc DATETIME(6) NULL,
              INDEX ix_profiles_last_used (last_used_at_utc)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            """;
        await command.ExecuteNonQueryAsync(token);
    }

    private void AddParameters(
        MySqlCommand command, SavedSaeConnectionProfile p, string fingerprint)
    {
        command.Parameters.AddWithValue("@id", p.Id.ToString("D"));
        command.Parameters.AddWithValue("@fingerprint", fingerprint);
        command.Parameters.AddWithValue("@displayName", p.DisplayName);
        command.Parameters.AddWithValue("@host", p.Host);
        command.Parameters.AddWithValue("@port", p.Port);
        command.Parameters.AddWithValue("@database", p.Database);
        command.Parameters.AddWithValue("@username", p.Username);
        command.Parameters.AddWithValue("@password", _protector.Protect(p.Password));
        command.Parameters.AddWithValue("@company", p.CompanyNumber);
        command.Parameters.AddWithValue("@version", p.SaeVersion);
        command.Parameters.AddWithValue("@charset", p.Charset);
    }

    private async Task<SavedSaeConnectionProfile?> ReadProfileAsync(
        MySqlConnection connection, Guid id, CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, display_name, host_name, port, database_path, user_name,
                   protected_password, company_number, sae_version, charset_name,
                   updated_at_utc
            FROM sae_connection_profiles WHERE id = @id;
            """;
        command.Parameters.AddWithValue("@id", id.ToString("D"));
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        return new(
            reader.GetGuid(0), reader.GetString(1),
            reader.GetString(2), reader.GetInt32(3), reader.GetString(4),
            reader.GetString(5), _protector.Unprotect(reader.GetString(6)),
            reader.GetString(7), reader.GetString(8), reader.GetString(9),
            DateTime.SpecifyKind(reader.GetDateTime(10), DateTimeKind.Utc));
    }

    private static async Task<SavedSaeConnectionSummary?> GetSummaryAsync(
        MySqlConnection connection, Guid id, CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, display_name, host_name, port, database_path, user_name,
                   company_number, sae_version, charset_name, updated_at_utc
            FROM sae_connection_profiles WHERE id = @id;
            """;
        command.Parameters.AddWithValue("@id", id.ToString("D"));
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? ReadSummary(reader) : null;
    }

    private static SavedSaeConnectionSummary ReadSummary(MySqlDataReader reader) =>
        new(reader.GetGuid(0), reader.GetString(1),
            reader.GetString(2), reader.GetInt32(3), reader.GetString(4),
            reader.GetString(5), reader.GetString(6), reader.GetString(7),
            reader.GetString(8),
            DateTime.SpecifyKind(reader.GetDateTime(9), DateTimeKind.Utc));

    private static Guid ToGuid(object value) =>
        value is Guid guid ? guid : Guid.Parse(Convert.ToString(value)!);
}
