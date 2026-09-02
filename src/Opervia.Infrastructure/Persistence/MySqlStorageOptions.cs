namespace Opervia.Infrastructure.Persistence;

public sealed class MySqlStorageOptions
{
    public const string SectionName = "OperviaStorage";
    public string ConnectionString { get; init; } = "";
}
