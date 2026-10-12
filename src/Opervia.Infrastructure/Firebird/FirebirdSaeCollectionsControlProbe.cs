using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Access;
using Opervia.Application.Collections;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeCollectionsControlProbe(ILogger<FirebirdSaeCollectionsControlProbe> logger) : ISaeCollectionsControlProbe
{
    public async Task<SaeCollectionsControlResult> ReadAsync(SaeConnectionProfile profile, string password, CancellationToken token = default)
    {
        var watch = Stopwatch.StartNew();
        var today = DateOnly.FromDateTime(DateTime.Today);
        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(new FbTransactionOptions {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            }, token);
            // Combine signed movements, then aggregate once. Joining two large grouped ledgers
            // produces a costly nested scan in Firebird and can multiply amounts if done before grouping.
            // The composite key includes customer, reference AND installment, including charge zero.
            var seller = "COALESCE(NULLIF(TRIM(F.CVE_VEND), ''), NULLIF(TRIM(M.SELLER), ''), C.CVE_VEND)";
            var catalogBalance = SellerAccessScope.IsRestricted ? "CAST(NULL AS NUMERIC(18, 2))" : "C.SALDO";
            var sql = $"""
                WITH MOVEMENTS AS (
                    SELECT CVE_CLIE, REFER, NUM_CARGO, NO_FACTURA, FECHA_APLI, FECHA_VENC, STRCVEVEND AS SELLER, STATUS,
                        CASE WHEN NUM_CPTO = 1 AND SIGNO = 1 THEN 1 ELSE 0 END AS IS_INVOICE,
                        COALESCE(IMPORTE,0) * COALESCE(SIGNO,0) AS ORIGINAL,
                        COALESCE(IMPORTE,0) * COALESCE(SIGNO,0) AS BALANCE
                    FROM {profile.ResolveTableName("CUEN_M")}
                    UNION ALL
                    SELECT CVE_CLIE, REFER, NUM_CARGO, NULL, NULL, NULL, NULL, NULL, 0, 0,
                        COALESCE(IMPORTE,0) * COALESCE(SIGNO,0)
                    FROM {profile.ResolveTableName("CUEN_DET")}
                ), ACCOUNTS AS (
                    SELECT CVE_CLIE, REFER, NUM_CARGO, MAX(NO_FACTURA) AS NO_FACTURA,
                        MIN(FECHA_APLI) AS FECHA_APLI, MIN(FECHA_VENC) AS FECHA_VENC,
                        MAX(SELLER) AS SELLER, MAX(STATUS) AS STATUS, MAX(IS_INVOICE) AS IS_INVOICE,
                        SUM(ORIGINAL) AS ORIGINAL, SUM(BALANCE) AS BALANCE
                    FROM MOVEMENTS GROUP BY CVE_CLIE, REFER, NUM_CARGO
                )
                SELECT M.CVE_CLIE,
                    COALESCE(NULLIF(TRIM(C.NOMBRECOMERCIAL),''),C.NOMBRE,M.CVE_CLIE),
                    C.STATUS, C.CLASIFIC, C.CVE_VEND, {catalogBalance},
                    COALESCE(NULLIF(TRIM(M.NO_FACTURA),''),M.REFER), M.REFER,
                    M.NUM_CARGO, {seller}, COALESCE(NULLIF(TRIM(V.NOMBRE),''),{seller},'Sin vendedor'),
                    COALESCE(F.FECHAELAB,F.FECHA_DOC,M.FECHA_APLI), COALESCE(M.FECHA_VENC,F.FECHA_VEN),
                    M.ORIGINAL, M.BALANCE,
                    F.CVE_DOC, F.STATUS, M.IS_INVOICE, M.STATUS
                FROM ACCOUNTS M
                LEFT JOIN {profile.ResolveTableName("CLIE")} C ON C.CLAVE = M.CVE_CLIE
                LEFT JOIN {profile.ResolveTableName("FACTF")} F ON F.CVE_DOC = M.NO_FACTURA AND F.CVE_CLPV = M.CVE_CLIE
                LEFT JOIN {profile.ResolveTableName("VEND")} V ON TRIM(V.CVE_VEND) = TRIM({seller})
                WHERE {SellerAccessScope.Sql(seller)}
                """;
            await using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 45 };
            await using var reader = await command.ExecuteReaderAsync(token);
            var customers = new Dictionary<string, CollectionCustomer>(StringComparer.OrdinalIgnoreCase);
            var charges = new List<CollectionPendingCharge>();
            var totals = new Dictionary<(string Customer, string Seller), (decimal Ledger, decimal Credits, decimal Pending)>();
            while (await reader.ReadAsync(token))
            {
                var customer = Text(reader, 0);
                // Do not expose unassigned catalog sellers to restricted accounts.
                var assigned = Text(reader, 4);
                customers.TryAdd(customer, new(customer, Text(reader, 1), Text(reader, 2), Text(reader, 3),
                    SellerAccessScope.Allows(assigned) ? assigned : "", reader.IsDBNull(5) ? null : Number(reader, 5)));
                var sellerCode = Text(reader, 9);
                var balance = decimal.Round(Number(reader, 14), 2, MidpointRounding.AwayFromZero);
                var isInvoice = !reader.IsDBNull(15) || Number(reader, 17) == 1;
                var cancelled = Text(reader, 16) == "C" || Text(reader, 18) == "C";
                var pending = balance > 0.005m && isInvoice && !cancelled;
                var key = (customer, sellerCode);
                var old = totals.GetValueOrDefault(key);
                totals[key] = (old.Ledger + balance, old.Credits + (balance < 0 ? -balance : 0), old.Pending + (pending ? balance : 0));
                if (!pending) continue;
                var due = Date(reader, 12);
                charges.Add(new(customer, Text(reader, 6), Text(reader, 7), (int)Number(reader, 8), sellerCode,
                    Text(reader, 10), Date(reader, 11), due, Number(reader, 13), balance, CollectionAging.Bucket(due, today)));
            }
            await reader.DisposeAsync();
            // Also include nonzero catalog balances with no ledger entries, so reconciliation cannot hide them.
            if (!SellerAccessScope.IsRestricted)
            {
                await using var catalog = new FbCommand($"""
                    SELECT CLAVE, COALESCE(NULLIF(TRIM(NOMBRECOMERCIAL),''),NOMBRE,CLAVE), STATUS, CLASIFIC, CVE_VEND, SALDO
                    FROM {profile.ResolveTableName("CLIE")} WHERE ABS(COALESCE(SALDO,0)) >= 0.005
                    """, connection, transaction) { CommandTimeout = 20 };
                await using var catalogReader = await catalog.ExecuteReaderAsync(token);
                while (await catalogReader.ReadAsync(token))
                    customers.TryAdd(Text(catalogReader, 0), new(Text(catalogReader, 0), Text(catalogReader, 1), Text(catalogReader, 2),
                        Text(catalogReader, 3), Text(catalogReader, 4), Number(catalogReader, 5)));
            }
            var accounts = totals.Select(row => new CollectionAccountTotal(row.Key.Customer, row.Key.Seller,
                row.Value.Ledger, row.Value.Credits, row.Value.Ledger - row.Value.Pending + row.Value.Credits, row.Value.Pending)).ToArray();
            return new(true, "Cartera pendiente consultada en SAE.", today, DateTimeOffset.Now,
                customers.Values.ToArray(), charges, accounts, watch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            logger.LogError(exception, "Falló el control de cobranza.");
            return new(false, "No fue posible consultar el control de cobranza.", today, DateTimeOffset.Now, [], [], [], watch.ElapsedMilliseconds);
        }
    }
    private static string Text(FbDataReader reader, int index) => reader.IsDBNull(index) ? "" : reader.GetString(index).Trim();
    private static decimal Number(FbDataReader reader, int index) => reader.IsDBNull(index) ? 0 : Convert.ToDecimal(reader.GetValue(index));
    private static DateTime? Date(FbDataReader reader, int index) => reader.IsDBNull(index) ? null : reader.GetDateTime(index);
}
