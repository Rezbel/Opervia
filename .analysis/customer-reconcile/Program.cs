using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;

using var http = new HttpClient();
var profile = JsonDocument.Parse(await http.GetStringAsync("http://localhost:5106/api/connections/last-used")).RootElement;
string Value(string key) => profile.GetProperty(key).GetString()!;
var builder = new FbConnectionStringBuilder { DataSource = Value("host"), Port = profile.GetProperty("port").GetInt32(), Database = Value("database"), UserID = Value("username"), Password = Value("password"), Charset = Value("charset"), Pooling = false };
using var connection = new FbConnection(builder.ToString());
await connection.OpenAsync();
using var transaction = connection.BeginTransaction(new FbTransactionOptions { TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait });
if (args[0] == "--invoice-audit") {
    var balances = new Dictionary<(string Client, string Refer, int Charge), decimal>();
    var invoices = new Dictionary<(string Client, string Refer, int Charge), string>();
    var validInvoices = new HashSet<(string Client, string Invoice)>();
    var historicalInvoices = new HashSet<(string Client, string Refer, int Charge)>();
    var cancelledRoots = new HashSet<(string Client, string Refer, int Charge)>();
    async Task Read(string sql, Action<FbDataReader> action) {
        using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 30 };
        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) action(reader);
    }
    string Text(FbDataReader reader, int i) => reader.IsDBNull(i) ? "" : reader.GetString(i).Trim();
    decimal Number(FbDataReader reader, int i) => reader.IsDBNull(i) ? 0 : Convert.ToDecimal(reader.GetValue(i));
    await Read("SELECT CVE_CLIE,REFER,NUM_CARGO,NO_FACTURA,IMPORTE,SIGNO,NUM_CPTO,STATUS FROM CUEN_M15", r => {
        var key = (Text(r,0),Text(r,1),(int)Number(r,2));
        balances[key] = balances.GetValueOrDefault(key) + Number(r,4)*Number(r,5);
        var invoice = Text(r,3);
        if (!invoices.TryGetValue(key,out var previous) || string.CompareOrdinal(invoice, previous)>0) invoices[key]=invoice;
        if (Number(r,6)==1 && Number(r,5)==1) historicalInvoices.Add(key);
        if (Text(r,7)=="C") cancelledRoots.Add(key);
    });
    await Read("SELECT CVE_CLIE,REFER,NUM_CARGO,IMPORTE,SIGNO FROM CUEN_DET15", r => {
        var key = (Text(r,0),Text(r,1),(int)Number(r,2));
        balances[key] = balances.GetValueOrDefault(key) + Number(r,3)*Number(r,4);
    });
    await Read("SELECT CVE_CLPV,CVE_DOC,STATUS FROM FACTF15", r => {
        if (Text(r,2)!="C") validInvoices.Add((Text(r,0),Text(r,1)));
    });
    var totals = balances.GroupBy(row=>row.Key.Client).ToDictionary(group=>group.Key,group=>new {
        Accounting=group.Sum(row=>row.Value),
        Pending=group.Where(row=>row.Value>0.005m && !cancelledRoots.Contains(row.Key) && (historicalInvoices.Contains(row.Key) || invoices.TryGetValue(row.Key,out var inv) && validInvoices.Contains((row.Key.Client,inv)))).Sum(row=>row.Value),
        Credit=group.Where(row=>row.Value < -0.005m).Sum(row=>-row.Value)
    });
    var clients=0; var invoiceDifferences=0; var accountingDifferences=0; var withCredit=0; var withOther=0;
    var exceptions = new List<object>();
    await Read("SELECT CLAVE,SALDO FROM CLIE15", r=> {
        clients++; totals.TryGetValue(Text(r,0),out var t);
        if (Math.Abs(Number(r,1)-(t?.Pending ?? 0))>0.01m) {
            invoiceDifferences++;
            exceptions.Add(new {code=Text(r,0),sae=Number(r,1),pending=t?.Pending ?? 0,credit=t?.Credit ?? 0,other=(t?.Accounting ?? 0)-(t?.Pending ?? 0)+(t?.Credit ?? 0),difference=Number(r,1)-(t?.Accounting ?? 0)});
        }
        if (Math.Abs(Number(r,1)-(t?.Accounting ?? 0))>0.01m) accountingDifferences++;
        if ((t?.Credit ?? 0)>0.005m) withCredit++;
        if (Math.Abs((t?.Accounting ?? 0)-(t?.Pending ?? 0)+(t?.Credit ?? 0))>0.01m) withOther++;
    });
    Console.WriteLine(JsonSerializer.Serialize(new {clients,invoiceDifferences,accountingDifferences,withCredit,withOther,exceptions}));
    transaction.Rollback(); return;
}
var tasks = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(args[0]))!;
foreach (var (name, sql) in tasks) {
    using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 120 };
    using var reader = await command.ExecuteReaderAsync();
    var rows = new List<Dictionary<string, object?>>();
    while (await reader.ReadAsync()) {
        var row = new Dictionary<string, object?>();
        for (var i = 0; i < reader.FieldCount; i++) row[reader.GetName(i).Trim()] = reader.IsDBNull(i) ? null : reader.GetValue(i) is string s ? s.Trim() : reader.GetValue(i);
        rows.Add(row);
    }
    Console.WriteLine(JsonSerializer.Serialize(new { name, rows }));
}
transaction.Rollback();
