namespace Opervia.Application.Collections;

public static class CollectionAging
{
    public static string Bucket(DateTime? dueDate, DateOnly today)
    {
        if (dueDate is null) return "undated";
        var days = today.DayNumber - DateOnly.FromDateTime(dueDate.Value).DayNumber;
        return days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    }
}
