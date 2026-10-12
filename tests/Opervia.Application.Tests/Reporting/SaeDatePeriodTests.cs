using Opervia.Application.Reporting;
using Xunit;

namespace Opervia.Application.Tests.Reporting;

public sealed class SaeDatePeriodTests
{
    [Fact]
    public void SameDayIncludesEveryHourOfTheDay()
    {
        var day = new DateOnly(2026, 10, 7);
        var period = SaeDatePeriod.Create(day, day);
        Assert.Equal(new DateTime(2026, 10, 7), period.FromInclusive);
        Assert.Equal(new DateTime(2026, 10, 8), period.UntilExclusive);
        var finalMovement = new DateTime(2026, 10, 7, 23, 59, 59);
        Assert.True(finalMovement >= period.FromInclusive && finalMovement < period.UntilExclusive);
    }

    [Fact]
    public void LeapDayAndYearBoundaryAreIncluded()
    {
        Assert.Equal(new DateTime(2024, 3, 1), SaeDatePeriod.Create(new(2024, 2, 1), new(2024, 2, 29)).UntilExclusive);
        Assert.Equal(new DateTime(2027, 1, 1), SaeDatePeriod.Create(new(2026, 1, 1), new(2026, 12, 31)).UntilExclusive);
    }

    [Fact]
    public void ReversedOrUnboundedRangesAreRejected()
    {
        Assert.Throws<ArgumentException>(() => SaeDatePeriod.Create(new(2026, 10, 8), new(2026, 10, 7)));
        Assert.Throws<ArgumentOutOfRangeException>(() => SaeDatePeriod.Create(new(2026, 1, 1), DateOnly.MaxValue));
    }
}
