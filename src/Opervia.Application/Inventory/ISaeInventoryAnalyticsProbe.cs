using Opervia.Domain.Connections;

namespace Opervia.Application.Inventory;

public interface ISaeInventoryAnalyticsProbe
{
    Task<SaeInventoryAnalyticsResult> ReadAsync(
        SaeConnectionProfile profile,
        string password,
        DateOnly from,
        DateOnly to,
        string? sellerCode,
        int? warehouseNumber,
        string? productLine,
        CancellationToken cancellationToken = default);
}
