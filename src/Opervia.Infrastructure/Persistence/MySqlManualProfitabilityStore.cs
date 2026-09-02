using Microsoft.Extensions.Options;
using MySqlConnector;
using Opervia.Application.Profitability;

namespace Opervia.Infrastructure.Persistence;

public sealed class MySqlManualProfitabilityStore(
    IOptions<MySqlStorageOptions> options
) : IManualProfitabilityStore
{
    private readonly string _connectionString = options.Value.ConnectionString;

    public async Task<IReadOnlyList<ManualProfitabilityEntry>> ListAsync(
        DateOnly from, DateOnly to, string? branch,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            SELECT id, entry_date, category, branch_name, amount, note, created_at_utc
            FROM manual_profitability_entries
            WHERE entry_date >= @from AND entry_date <= @to
              {(string.IsNullOrWhiteSpace(branch) ? "" : "AND branch_name = @branch")}
            ORDER BY entry_date DESC, created_at_utc DESC;
            """;
        command.Parameters.AddWithValue("@from", from.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("@to", to.ToDateTime(TimeOnly.MinValue));
        if (!string.IsNullOrWhiteSpace(branch))
            command.Parameters.AddWithValue("@branch", branch.Trim());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var items = new List<ManualProfitabilityEntry>();
        while (await reader.ReadAsync(cancellationToken))
            items.Add(Read(reader));
        return items;
    }

    public async Task<ManualProfitabilityEntry> AddAsync(
        CreateManualProfitabilityEntry entry,
        CancellationToken cancellationToken = default)
    {
        var id = Guid.NewGuid();
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO manual_profitability_entries
              (id, entry_date, category, branch_name, amount, note, created_at_utc)
            VALUES (@id, @date, @category, @branch, @amount, @note, UTC_TIMESTAMP(6));
            """;
        command.Parameters.AddWithValue("@id", id.ToString("D"));
        command.Parameters.AddWithValue("@date", entry.EntryDate.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("@category", entry.Category.Trim());
        command.Parameters.AddWithValue("@branch", string.IsNullOrWhiteSpace(entry.Branch)
            ? DBNull.Value : entry.Branch.Trim());
        command.Parameters.AddWithValue("@amount", entry.Amount);
        command.Parameters.AddWithValue("@note", string.IsNullOrWhiteSpace(entry.Note)
            ? DBNull.Value : entry.Note.Trim());
        await command.ExecuteNonQueryAsync(cancellationToken);

        await using var read = connection.CreateCommand();
        read.CommandText =
            """
            SELECT id, entry_date, category, branch_name, amount, note, created_at_utc
            FROM manual_profitability_entries WHERE id = @id;
            """;
        read.Parameters.AddWithValue("@id", id.ToString("D"));
        await using var reader = await read.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return Read(reader);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM manual_profitability_entries WHERE id = @id;";
        command.Parameters.AddWithValue("@id", id.ToString("D"));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    private async Task<MySqlConnection> OpenAsync(CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
            throw new InvalidOperationException("MySQL no está configurado para Opervia.");
        var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(token);
        return connection;
    }

    private static async Task EnsureSchemaAsync(MySqlConnection connection, CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS manual_profitability_entries (
              id CHAR(36) NOT NULL PRIMARY KEY,
              entry_date DATE NOT NULL,
              category VARCHAR(120) NOT NULL,
              branch_name VARCHAR(80) NULL,
              amount DECIMAL(18,4) NOT NULL,
              note VARCHAR(500) NULL,
              created_at_utc DATETIME(6) NOT NULL,
              INDEX ix_manual_profitability_period (entry_date),
              INDEX ix_manual_profitability_branch (branch_name)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            """;
        await command.ExecuteNonQueryAsync(token);
    }

    private static ManualProfitabilityEntry Read(MySqlDataReader reader) => new(
        reader.GetGuid(0),
        DateOnly.FromDateTime(reader.GetDateTime(1)),
        reader.GetString(2),
        reader.IsDBNull(3) ? null : reader.GetString(3),
        reader.GetDecimal(4),
        reader.IsDBNull(5) ? null : reader.GetString(5),
        DateTime.SpecifyKind(reader.GetDateTime(6), DateTimeKind.Utc));
}
