using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Customers;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeCustomerPortfolioProbe(ILogger<FirebirdSaeCustomerPortfolioProbe> logger) : ISaeCustomerPortfolioProbe
{
    public async Task<SaeCustomerPortfolioResult> ReadAsync(
        SaeConnectionProfile profile, string password, DateOnly from, DateOnly to,
        SaeCustomerPortfolioFilter filter, CancellationToken cancellationToken = default)
    {
        var watch = Stopwatch.StartNew();
        filter = Normalize(filter);
        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(new FbTransactionOptions {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            }, cancellationToken);
            var customers = await ReadCustomersAsync(connection, transaction, profile, filter, cancellationToken);
            var invoices = new List<SaeCustomerPeriodInvoice>();
            decimal? credits = null, other = null, accounting = null, invoiceTotal = null, difference = null;
            IReadOnlyList<SaeCustomerPendingCharge>? pendingCharges = null;
            if (filter.SelectedCustomerCode is not null && customers.Count == 1)
            {
                var accounts = await ReadAccountsAsync(connection, transaction, profile, customers[0].RawCustomerCode, cancellationToken);
                credits = accounts.Where(a => a.Balance < 0).Sum(a => -a.Balance);
                accounting = accounts.Sum(a => a.Balance);
                pendingCharges = accounts.Where(a => a.Balance > 0.005m && a.IsInvoice && !a.IsCancelled)
                    .Select(a => new SaeCustomerPendingCharge(a.DueDate, a.Balance)).ToArray();
                foreach (var group in accounts.Where(a => a.Balance > 0.005m && a.IsInvoice && !a.IsCancelled)
                    .GroupBy(a => a.Invoice, StringComparer.OrdinalIgnoreCase))
                {
                    var due = group.Where(a => a.DueDate.HasValue).Select(a => a.DueDate).Min();
                    var first = group.First();
                    invoices.Add(new(group.Key, first.DocumentDate, due, first.Seller, group.Sum(a => a.Balance),
                        due?.Date < DateTime.Today ? "Vencido" : "Adeudo", group.Sum(a => a.OriginalAmount)));
                }
                invoices = invoices.OrderBy(a => a.DueDate ?? DateTime.MaxValue).ThenBy(a => a.InvoiceNumber).ToList();
                invoiceTotal = invoices.Sum(i => i.Amount);
                // Credits and other account entries explain the difference from positive invoice balances.
                other = accounting - invoiceTotal + credits;
                difference = customers[0].Balance - accounting;
            }
            return new(true, "Se consultó la cartera de clientes.", from, to, customers, invoices, watch.ElapsedMilliseconds,
                invoiceTotal, credits, other, accounting, difference, pendingCharges);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            logger.LogError(exception, "Falló la consulta de cartera por cliente.");
            return new(false, "No fue posible consultar la cartera de clientes.", from, to,
                Array.Empty<SaeCustomerPortfolioRow>(), Array.Empty<SaeCustomerPeriodInvoice>(), watch.ElapsedMilliseconds);
        }
    }

    private static async Task<IReadOnlyList<SaeCustomerPortfolioRow>> ReadCustomersAsync(
        FbConnection connection, FbTransaction transaction, SaeConnectionProfile profile,
        SaeCustomerPortfolioFilter filter, CancellationToken token)
    {
        var conditions = new List<string>();
        if (filter.SellerCode is not null) conditions.Add("TRIM(C.CVE_VEND) = @SELLER");
        if (filter.StateCode is not null) conditions.Add("UPPER(TRIM(C.STATUS)) = @STATE");
        if (filter.BranchCode is not null) conditions.Add("SUBSTRING(UPPER(TRIM(C.CLASIFIC)) FROM 1 FOR 1) = @BRANCH");
        if (filter.CustomerTypeCode is not null) conditions.Add("SUBSTRING(UPPER(TRIM(C.CLASIFIC)) FROM 3 FOR 1) = @TYPE");
        if (filter.ClassificationCode is not null) conditions.Add("SUBSTRING(UPPER(TRIM(C.CLASIFIC)) FROM 4 FOR 1) = @CLASSIFICATION");
        if (filter.CreditCode is not null) conditions.Add("SUBSTRING(UPPER(TRIM(C.CLASIFIC)) FROM 5 FOR 1) = @CREDIT");
        if (filter.SelectedCustomerCode is not null) conditions.Add("TRIM(C.CLAVE) = @CUSTOMER");
        var where = conditions.Count == 0 ? string.Empty : "WHERE " + string.Join(" AND ", conditions);
        // The initial list reads the catalog only, in the order returned by SAE.
        var sql = $"""
            SELECT C.CLAVE, COALESCE(NULLIF(TRIM(C.NOMBRECOMERCIAL), ''), C.NOMBRE, C.CLAVE),
                C.CVE_VEND, C.STATUS, C.CLASIFIC, C.CON_CREDITO, C.LIMCRED, C.DIASCRED, C.SALDO
            FROM {profile.ResolveTableName("CLIE")} C {where}
            """;
        await using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 20 };
        void Parameter(string name, string? value) { if (value is not null) command.Parameters.AddWithValue(name, value); }
        Parameter("@SELLER", filter.SellerCode); Parameter("@STATE", filter.StateCode);
        Parameter("@BRANCH", filter.BranchCode); Parameter("@TYPE", filter.CustomerTypeCode);
        Parameter("@CLASSIFICATION", filter.ClassificationCode); Parameter("@CREDIT", filter.CreditCode);
        Parameter("@CUSTOMER", filter.SelectedCustomerCode);
        await using var reader = await command.ExecuteReaderAsync(token);
        var customers = new List<SaeCustomerPortfolioRow>();
        while (await reader.ReadAsync(token))
            customers.Add(new(Text(reader, 0), Text(reader, 1), Text(reader, 2), Text(reader, 3), Text(reader, 4),
                Text(reader, 5) == "S", Number(reader, 6), (int)Number(reader, 7), Number(reader, 8), reader.GetString(0)));
        return customers;
    }

    private static async Task<List<AccountBalance>> ReadAccountsAsync(
        FbConnection connection, FbTransaction transaction, SaeConnectionProfile profile, string customer, CancellationToken token)
    {
        // Applications use the composite customer/reference/charge key, not just NO_FACTURA.
        var sql = $"""
            WITH ROOTS AS (
                SELECT M.REFER, M.NUM_CARGO, MAX(M.NO_FACTURA) AS NO_FACTURA,
                    MIN(M.FECHA_APLI) AS FECHA_APLI, MIN(M.FECHA_VENC) AS FECHA_VENC,
                    MAX(CASE WHEN M.NUM_CPTO = 1 AND M.SIGNO = 1 THEN 1 ELSE 0 END) AS IS_INVOICE,
                    MAX(M.STATUS) AS STATUS,
                    MAX(M.STRCVEVEND) AS SELLER, SUM(COALESCE(M.IMPORTE, 0) * COALESCE(M.SIGNO, 0)) AS ORIGINAL
                FROM {profile.ResolveTableName("CUEN_M")} M WHERE M.CVE_CLIE = @CUSTOMER
                GROUP BY M.REFER, M.NUM_CARGO
            ), APPLICATIONS AS (
                SELECT D.REFER, D.NUM_CARGO,
                    SUM(COALESCE(D.IMPORTE, 0) * COALESCE(D.SIGNO, 0)) AS APPLIED
                FROM {profile.ResolveTableName("CUEN_DET")} D WHERE D.CVE_CLIE = @CUSTOMER
                GROUP BY D.REFER, D.NUM_CARGO
            )
            SELECT COALESCE(NULLIF(TRIM(M.NO_FACTURA), ''), TRIM(M.REFER), TRIM(D.REFER)),
                COALESCE(F.FECHA_DOC, M.FECHA_APLI), COALESCE(M.FECHA_VENC, F.FECHA_VEN),
                COALESCE(F.CVE_VEND, M.SELLER), COALESCE(M.ORIGINAL, 0),
                COALESCE(M.ORIGINAL, 0) + COALESCE(D.APPLIED, 0), F.CVE_DOC, F.STATUS, M.IS_INVOICE, M.STATUS
            FROM ROOTS M FULL OUTER JOIN APPLICATIONS D
                ON D.REFER = M.REFER AND D.NUM_CARGO = M.NUM_CARGO
            LEFT JOIN {profile.ResolveTableName("FACTF")} F ON F.CVE_DOC = M.NO_FACTURA AND F.CVE_CLPV = @CUSTOMER
            """;
        await using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 30 };
        command.Parameters.AddWithValue("@CUSTOMER", customer);
        await using var reader = await command.ExecuteReaderAsync(token);
        var accounts = new List<AccountBalance>();
        while (await reader.ReadAsync(token))
            accounts.Add(new(Text(reader, 0), reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                reader.IsDBNull(2) ? null : reader.GetDateTime(2), Text(reader, 3), Number(reader, 4), Number(reader, 5),
                // SAE keeps historical invoice charges (concept 1) even when FACTF no longer has the document.
                !reader.IsDBNull(6) || Number(reader, 8) == 1, Text(reader, 7) == "C" || Text(reader, 9) == "C"));
        return accounts;
    }

    private sealed record AccountBalance(string Invoice, DateTime DocumentDate, DateTime? DueDate,
        string Seller, decimal OriginalAmount, decimal Balance, bool IsInvoice, bool IsCancelled);
    private static SaeCustomerPortfolioFilter Normalize(SaeCustomerPortfolioFilter f) => f with {
        SellerCode = Clean(f.SellerCode), BranchCode = Clean(f.BranchCode), StateCode = Clean(f.StateCode),
        CustomerTypeCode = Clean(f.CustomerTypeCode), ClassificationCode = Clean(f.ClassificationCode),
        CreditCode = Clean(f.CreditCode), SelectedCustomerCode = Clean(f.SelectedCustomerCode) };
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();
    private static string Text(FbDataReader reader, int i) => reader.IsDBNull(i) ? string.Empty : reader.GetString(i).Trim();
    private static decimal Number(FbDataReader reader, int i) => reader.IsDBNull(i) ? 0 : Convert.ToDecimal(reader.GetValue(i));
}
