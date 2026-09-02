using Opervia.Domain.Connections;

namespace Opervia.Application.Tests.Connections;

public sealed class SaeConnectionProfileTests
{
    [Fact]
    public void ResolveTableName_AppendsNormalizedCompanyNumber()
    {
        var profile = CreateProfile(" 15 ");

        var tableName = profile.ResolveTableName("par_factf");

        Assert.Equal("PAR_FACTF15", tableName);
    }

    [Theory]
    [InlineData("")]
    [InlineData("1A")]
    [InlineData("1-2")]
    public void Constructor_RejectsInvalidCompanyNumber(
        string companyNumber
    )
    {
        Assert.Throws<ArgumentException>(
            () => CreateProfile(companyNumber)
        );
    }

    [Theory]
    [InlineData("")]
    [InlineData("FACTF;DROP TABLE")]
    [InlineData("FACTF-01")]
    public void ResolveTableName_RejectsInvalidBaseName(
        string baseTableName
    )
    {
        var profile = CreateProfile("1");

        Assert.Throws<ArgumentException>(
            () => profile.ResolveTableName(baseTableName)
        );
    }

    private static SaeConnectionProfile CreateProfile(
        string companyNumber
    )
    {
        return new SaeConnectionProfile
        {
            DisplayName = "Prueba",
            Host = "firebird.test",
            Database = "SAE.FDB",
            Username = "reader",
            CompanyNumber = companyNumber
        };
    }
}
