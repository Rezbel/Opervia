namespace Opervia.Application.Reporting;

public readonly record struct SaeDatePeriod(DateTime FromInclusive, DateTime UntilExclusive)
{
    // Both dates selected in the interface are included, even when SAE stores hours.
    public static SaeDatePeriod Create(DateOnly from, DateOnly to)
    {
        if (to < from) throw new ArgumentException("La fecha final no puede ser anterior a la inicial.");
        if (to == DateOnly.MaxValue) throw new ArgumentOutOfRangeException(nameof(to));
        return new(from.ToDateTime(TimeOnly.MinValue), to.AddDays(1).ToDateTime(TimeOnly.MinValue));
    }
}
