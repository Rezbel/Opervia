using Opervia.Application.Collections;

namespace Opervia.Application.Tests.Collections;

public sealed class CollectionAgingTests
{
    [Theory]
    [InlineData(-7, "current")]
    [InlineData(0, "current")]
    [InlineData(1, "1-30")]
    [InlineData(30, "1-30")]
    [InlineData(31, "31-60")]
    [InlineData(60, "31-60")]
    [InlineData(61, "61-90")]
    [InlineData(90, "61-90")]
    [InlineData(91, "90+")]
    public void UsesNonOverlappingCalendarDayBoundaries(int days, string bucket)
    {
        var today = new DateOnly(2026, 10, 7);
        Assert.Equal(bucket, CollectionAging.Bucket(today.AddDays(-days).ToDateTime(new TimeOnly(23, 59)), today));
    }

    [Fact]
    public void MissingDueDateIsNotConsideredCurrent() => Assert.Equal("undated", CollectionAging.Bucket(null, new(2026, 10, 7)));
}
