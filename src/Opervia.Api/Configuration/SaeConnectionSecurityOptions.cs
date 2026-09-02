namespace Opervia.Api.Configuration;

public sealed class SaeConnectionSecurityOptions
{
    public const string SectionName = "SaeConnectionSecurity";

    public bool AllowArbitraryTargetsInDevelopment { get; init; }

    public string[] AllowedHosts { get; init; } = [];

    public int[] AllowedPorts { get; init; } = [3050];
}
