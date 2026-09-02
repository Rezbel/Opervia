namespace Opervia.Application.Profitability;

public interface IManualProfitabilityStore
{
    Task<IReadOnlyList<ManualProfitabilityEntry>> ListAsync(
        DateOnly from,
        DateOnly to,
        string? branch,
        CancellationToken cancellationToken = default);

    Task<ManualProfitabilityEntry> AddAsync(
        CreateManualProfitabilityEntry entry,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
