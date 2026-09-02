using Opervia.Domain.Connections;

namespace Opervia.Api.Contracts.Connections;

public static class SaeConnectionRequestExtensions
{
    public static SaeConnectionProfile ToProfile(
        this TestSaeConnectionRequest request
    )
    {
        ArgumentNullException.ThrowIfNull(request);

        return new SaeConnectionProfile
        {
            DisplayName = request.DisplayName.Trim(),
            Host = request.Host.Trim(),
            Port = request.Port,
            Database = request.Database.Trim(),
            Username = request.Username.Trim(),
            CompanyNumber = request.CompanyNumber.Trim(),
            SaeVersion = request.SaeVersion.Trim(),
            Charset = request.Charset.Trim()
        };
    }
}
