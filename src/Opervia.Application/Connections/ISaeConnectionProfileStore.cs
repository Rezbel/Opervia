namespace Opervia.Application.Connections;

public sealed record SavedSaeConnectionProfile(
    Guid Id,
    string DisplayName,
    string Host,
    int Port,
    string Database,
    string Username,
    string Password,
    string CompanyNumber,
    string SaeVersion,
    string Charset,
    DateTime UpdatedAtUtc
);

public sealed record SavedSaeConnectionSummary(
    Guid Id,
    string DisplayName,
    string Host,
    int Port,
    string Database,
    string Username,
    string CompanyNumber,
    string SaeVersion,
    string Charset,
    DateTime UpdatedAtUtc
);

public interface ISaeConnectionProfileStore
{
    Task<IReadOnlyList<SavedSaeConnectionSummary>> ListAsync(
        CancellationToken cancellationToken);
    Task<SavedSaeConnectionProfile?> GetAsync(
        Guid id,
        bool markAsUsed,
        CancellationToken cancellationToken);
    Task<SavedSaeConnectionProfile?> GetLastUsedAsync(
        CancellationToken cancellationToken);
    Task<SavedSaeConnectionSummary> SaveAsync(
        SavedSaeConnectionProfile profile,
        CancellationToken cancellationToken);
    Task<bool> DeleteAsync(
        Guid id,
        CancellationToken cancellationToken);
}
