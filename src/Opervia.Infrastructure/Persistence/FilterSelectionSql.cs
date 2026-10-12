using System.Data.Common;
using System.Text.RegularExpressions;
using Opervia.Application.Reporting;
namespace Opervia.Infrastructure.Persistence;
internal static class FilterSelectionSql
{
    public static void Add(DbCommand command, string name, string? selection, bool numeric = false)
    {
        var values = FilterSelection.Values(selection);
        if (values.Length == 0) return;
        var names = values.Select((_, i) => $"{name}_{i}").ToArray();
        command.CommandText = Regex.Replace(command.CommandText, @"=\s*" + Regex.Escape(name) + @"\b", "IN (" + string.Join(",", names) + ")");
        for (var i = 0; i < values.Length; i++) {
            var parameter = command.CreateParameter(); parameter.ParameterName = names[i];
            parameter.Value = numeric ? int.Parse(values[i]) : values[i]; command.Parameters.Add(parameter);
        }
    }
}
