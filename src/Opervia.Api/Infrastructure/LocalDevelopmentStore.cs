using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Opervia.Application.Connections;
using Opervia.Application.Profitability;

namespace Opervia.Api.Infrastructure;

// Almacenamiento de desarrollo para equipos sin MySQL. Las contraseñas se cifran.
public sealed class LocalDevelopmentStore : ISaeConnectionProfileStore, IManualProfitabilityStore
{
    private readonly string path;
    private readonly IDataProtector protector;
    private readonly SemaphoreSlim gate = new(1, 1);
    private sealed record State(List<SavedSaeConnectionProfile> Profiles, List<ManualProfitabilityEntry> Entries);

    public LocalDevelopmentStore(IWebHostEnvironment environment, IDataProtectionProvider provider)
    {
        path = Path.Combine(environment.ContentRootPath, "App_Data", "development.json");
        protector = provider.CreateProtector("Opervia.LocalDevelopmentPasswords.v1");
    }

    private async Task<T> Access<T>(Func<State, T> action, bool write, CancellationToken token)
    {
        await gate.WaitAsync(token);
        try
        {
            var state = File.Exists(path)
                ? JsonSerializer.Deserialize<State>(await File.ReadAllTextAsync(path, token))
                    ?? throw new InvalidDataException("Almacenamiento local inválido.")
                : new State([], []);
            var result = action(state);
            if (write)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                await File.WriteAllTextAsync(path + ".tmp", JsonSerializer.Serialize(state), token);
                File.Move(path + ".tmp", path, true);
            }
            return result;
        }
        finally { gate.Release(); }
    }

    private static SavedSaeConnectionSummary Summary(SavedSaeConnectionProfile p) => new(
        p.Id, p.DisplayName, p.Host, p.Port, p.Database, p.Username,
        p.CompanyNumber, p.SaeVersion, p.Charset, p.UpdatedAtUtc);
    private SavedSaeConnectionProfile? Decode(SavedSaeConnectionProfile? p) =>
        p is null ? null : p with { Password = protector.Unprotect(p.Password) };

    public Task<IReadOnlyList<SavedSaeConnectionSummary>> ListAsync(CancellationToken token) =>
        Access<IReadOnlyList<SavedSaeConnectionSummary>>(s => s.Profiles.AsEnumerable().Reverse().Select(Summary).ToArray(), false, token);
    public Task<SavedSaeConnectionProfile?> GetAsync(Guid id, bool markAsUsed, CancellationToken token) =>
        Access(s => {
            var p = s.Profiles.Find(p => p.Id == id);
            if (p is not null && markAsUsed) { s.Profiles.Remove(p); s.Profiles.Add(p); }
            return Decode(p);
        }, markAsUsed, token);
    public Task<SavedSaeConnectionProfile?> GetLastUsedAsync(CancellationToken token) =>
        Access(s => Decode(s.Profiles.LastOrDefault()), false, token);
    public Task<SavedSaeConnectionSummary> SaveAsync(SavedSaeConnectionProfile profile, CancellationToken token) =>
        Access(s => {
            var existing = s.Profiles.Find(p =>
                p.Host.Trim().Equals(profile.Host.Trim(), StringComparison.OrdinalIgnoreCase) &&
                p.Port == profile.Port &&
                p.Database.Trim().Equals(profile.Database.Trim(), StringComparison.OrdinalIgnoreCase) &&
                p.Username.Trim().Equals(profile.Username.Trim(), StringComparison.OrdinalIgnoreCase) &&
                p.CompanyNumber.Trim() == profile.CompanyNumber.Trim());
            var saved = profile with {
                Id = existing?.Id ?? profile.Id,
                Password = protector.Protect(profile.Password), UpdatedAtUtc = DateTime.UtcNow };
            s.Profiles.RemoveAll(p => p.Id == saved.Id);
            s.Profiles.Add(saved);
            return Summary(saved);
        }, true, token);
    Task<bool> ISaeConnectionProfileStore.DeleteAsync(Guid id, CancellationToken token) =>
        Access(s => s.Profiles.RemoveAll(p => p.Id == id) > 0, true, token);

    public Task<IReadOnlyList<ManualProfitabilityEntry>> ListAsync(DateOnly from, DateOnly to, string? branch, CancellationToken token = default) =>
        Access<IReadOnlyList<ManualProfitabilityEntry>>(s => s.Entries
            .Where(e => e.EntryDate >= from && e.EntryDate <= to &&
                (string.IsNullOrWhiteSpace(branch) || e.Branch == branch.Trim()))
            .OrderByDescending(e => e.EntryDate).ThenByDescending(e => e.CreatedAtUtc).ToArray(), false, token);
    public Task<ManualProfitabilityEntry> AddAsync(CreateManualProfitabilityEntry entry, CancellationToken token = default) =>
        Access(s => {
            var saved = new ManualProfitabilityEntry(Guid.NewGuid(), entry.EntryDate,
                entry.Category.Trim(), string.IsNullOrWhiteSpace(entry.Branch) ? null : entry.Branch.Trim(),
                entry.Amount, string.IsNullOrWhiteSpace(entry.Note) ? null : entry.Note.Trim(), DateTime.UtcNow);
            s.Entries.Add(saved);
            return saved;
        }, true, token);
    Task<bool> IManualProfitabilityStore.DeleteAsync(Guid id, CancellationToken token) =>
        Access(s => s.Entries.RemoveAll(e => e.Id == id) > 0, true, token);
}
