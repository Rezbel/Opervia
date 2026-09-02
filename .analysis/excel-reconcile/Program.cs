using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FirebirdSql.Data.FirebirdClient;

var profile = await new HttpClient().GetFromJsonAsync<ConnectionProfile>(
    "http://localhost:5106/api/connections/last-used",
    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
    ?? throw new InvalidOperationException("No hay perfil SAE activo.");

var company = new string(profile.CompanyNumber.Where(char.IsDigit).ToArray());
var connectionString = new FbConnectionStringBuilder
{
    DataSource = profile.Host,
    Port = profile.Port,
    Database = profile.Database,
    UserID = profile.Username,
    Password = profile.Password,
    Charset = profile.Charset,
    Pooling = false,
    ConnectionTimeout = 8
}.ToString();

var from = new DateTime(2025, 1, 1);
var toExclusive = new DateTime(2026, 5, 6);
var sae = new Dictionary<string, Invoice>(StringComparer.OrdinalIgnoreCase);
var allSaeStatuses = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
await using var connection = new FbConnection(connectionString);
await connection.OpenAsync();

await using (var command = connection.CreateCommand())
{
    command.CommandText = $"""
        SELECT TRIM(F.CVE_DOC), COALESCE(F.STATUS, '')
        FROM FACTF{company} F
        WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to;
        """;
    command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
    command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
        allSaeStatuses[reader.GetString(0)] = reader.GetString(1).Trim();
}

await using (var command = connection.CreateCommand())
{
    command.CommandText = $"""
        SELECT TRIM(F.CVE_DOC), F.FECHA_DOC,
          ABS(COALESCE(F.CAN_TOT, 0) - COALESCE(F.DES_TOT, 0))
        FROM FACTF{company} F
        WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
          AND COALESCE(F.STATUS, '') <> 'C';
        """;
    command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
    command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
        sae[reader.GetString(0)] = new(reader.GetDateTime(1), Convert.ToDecimal(reader.GetValue(2)), 0m);
}

await using (var command = connection.CreateCommand())
{
    command.CommandText = $"""
        SELECT TRIM(F.CVE_DOC),
          COALESCE(SUM(COALESCE(P.CANT, 0) * COALESCE(P.COST, 0)), 0)
        FROM FACTF{company} F
        INNER JOIN PAR_FACTF{company} P ON P.CVE_DOC = F.CVE_DOC
        WHERE F.FECHA_DOC >= @from AND F.FECHA_DOC < @to
          AND COALESCE(F.STATUS, '') <> 'C'
        GROUP BY F.CVE_DOC;
        """;
    command.Parameters.Add("@from", FbDbType.TimeStamp).Value = from;
    command.Parameters.Add("@to", FbDbType.TimeStamp).Value = toExclusive;
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        var key = reader.GetString(0);
        if (sae.TryGetValue(key, out var invoice))
            sae[key] = invoice with { Cost = Convert.ToDecimal(reader.GetValue(1)) };
    }
}

var excelJson = await File.ReadAllTextAsync("output/excel_invoices.json");
var excelRaw = JsonSerializer.Deserialize<Dictionary<string, ExcelInvoice>>(excelJson,
    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
var excel = excelRaw
    .Where(pair => pair.Value.DateSerial is not null)
    .Where(pair => DateTime.FromOADate(pair.Value.DateSerial!.Value) >= from
        && DateTime.FromOADate(pair.Value.DateSerial!.Value) < toExclusive)
    .ToDictionary(pair => pair.Key.Trim(), pair => pair.Value, StringComparer.OrdinalIgnoreCase);

var excelOnly = excel.Keys.Except(sae.Keys, StringComparer.OrdinalIgnoreCase).ToArray();
var saeOnly = sae.Keys.Except(excel.Keys, StringComparer.OrdinalIgnoreCase).ToArray();
var matched = excel.Keys.Intersect(sae.Keys, StringComparer.OrdinalIgnoreCase).ToArray();

var result = new
{
    Period = new { From = from, To = toExclusive.AddDays(-1) },
    Counts = new { Excel = excel.Count, Sae = sae.Count, Matched = matched.Length, ExcelOnly = excelOnly.Length, SaeOnly = saeOnly.Length },
    Sales = new
    {
        Excel = excel.Values.Sum(x => (decimal)x.Sales),
        Sae = sae.Values.Sum(x => x.Sales),
        Delta = excel.Values.Sum(x => (decimal)x.Sales) - sae.Values.Sum(x => x.Sales),
        ExcelOnly = excelOnly.Sum(key => (decimal)excel[key].Sales),
        SaeOnly = -saeOnly.Sum(key => sae[key].Sales),
        MatchedCalculation = matched.Sum(key => (decimal)excel[key].Sales - sae[key].Sales)
    },
    Cost = new
    {
        Excel = excel.Values.Sum(x => (decimal)x.Cost),
        Sae = sae.Values.Sum(x => x.Cost),
        Delta = excel.Values.Sum(x => (decimal)x.Cost) - sae.Values.Sum(x => x.Cost),
        ExcelOnly = excelOnly.Sum(key => (decimal)excel[key].Cost),
        SaeOnly = -saeOnly.Sum(key => sae[key].Cost),
        MatchedCalculation = matched.Sum(key => (decimal)excel[key].Cost - sae[key].Cost)
    },
    ExcelOnlyStatus = excelOnly.GroupBy(key => excel[key].Status ?? "Sin estado")
        .ToDictionary(group => group.Key, group => new { Count = group.Count(), Sales = group.Sum(key => excel[key].Sales), Cost = group.Sum(key => excel[key].Cost) }),
    ExcelOnlyCurrentSaeStatus = excelOnly.GroupBy(key => allSaeStatuses.GetValueOrDefault(key, "NO EXISTE"))
        .ToDictionary(group => group.Key, group => new { Count = group.Count(), Sales = group.Sum(key => excel[key].Sales), Cost = group.Sum(key => excel[key].Cost) }),
    TopSalesDifferences = matched.Select(key => new { Invoice = key, Excel = excel[key].Sales, Sae = sae[key].Sales, Delta = (decimal)excel[key].Sales - sae[key].Sales })
        .OrderByDescending(x => Math.Abs(x.Delta)).Take(15),
    TopCostDifferences = matched.Select(key => new { Invoice = key, Excel = excel[key].Cost, Sae = sae[key].Cost, Delta = (decimal)excel[key].Cost - sae[key].Cost })
        .OrderByDescending(x => Math.Abs(x.Delta)).Take(15),
    ExcelOnlyInvoices = excelOnly.Select(key => new { Invoice = key, excel[key].Status, excel[key].Sales, excel[key].Cost }).OrderByDescending(x => Math.Abs(x.Sales)).Take(30),
    SaeOnlyInvoices = saeOnly.Select(key => new { Invoice = key, sae[key].Sales, sae[key].Cost }).OrderByDescending(x => Math.Abs(x.Sales)).Take(30)
};

var json = JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
await File.WriteAllTextAsync("output/reconciliation.json", json);
Console.WriteLine(json);

sealed record ConnectionProfile(string Host, int Port, string Database, string Username, string Password, string CompanyNumber, string Charset);
sealed record Invoice(DateTime Date, decimal Sales, decimal Cost);
sealed record ExcelInvoice(
    double Sales,
    double Cost,
    [property: JsonPropertyName("date_serial")] double? DateSerial,
    string? Status,
    int Rows);
