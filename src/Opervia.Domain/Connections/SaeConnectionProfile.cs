namespace Opervia.Domain.Connections;

public sealed class SaeConnectionProfile
{
    private string _companyNumber = string.Empty;

    public Guid Id { get; init; } = Guid.NewGuid();

    public required string DisplayName { get; init; }

    public required string Host { get; init; }

    public int Port { get; init; } = 3050;

    public required string Database { get; init; }

    public required string Username { get; init; }

    public string SaeVersion { get; init; } = "10";

    public string Charset { get; init; } = "UTF8";

    public bool IsEnabled { get; set; } = true;

    public DateTimeOffset CreatedAtUtc { get; init; } =
        DateTimeOffset.UtcNow;

    public DateTimeOffset? LastSuccessfulConnectionUtc { get; set; }

    public string CompanyNumber
    {
        get => _companyNumber;

        init
        {
            var normalized = value?.Trim();

            if (string.IsNullOrWhiteSpace(normalized) ||
                !normalized.All(char.IsDigit))
            {
                throw new ArgumentException(
                    "El número de empresa debe contener solamente dígitos.",
                    nameof(CompanyNumber)
                );
            }

            _companyNumber = normalized;
        }
    }

    public string ResolveTableName(string baseTableName)
    {
        if (string.IsNullOrWhiteSpace(baseTableName) ||
            !baseTableName.All(
                character =>
                    char.IsLetterOrDigit(character) ||
                    character == '_'
            ))
        {
            throw new ArgumentException(
                "El nombre base de la tabla no es válido.",
                nameof(baseTableName)
            );
        }

        return $"{baseTableName.ToUpperInvariant()}{CompanyNumber}";
    }
}
