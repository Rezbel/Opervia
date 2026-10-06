using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Commercial;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed class FirebirdSaeCommercialProbe(ILogger<FirebirdSaeCommercialProbe> logger) : ISaeCommercialProbe
{
    private const string Net = "COALESCE(P.CANT,0)*COALESCE(P.PREC,0)*(1-COALESCE(P.DESC1,0)/100.0)*(1-COALESCE(P.DESC2,0)/100.0)*(1-COALESCE(P.DESC3,0)/100.0)";
    private const string Tax = "COALESCE(P.TOTIMP1,0)+COALESCE(P.TOTIMP2,0)+COALESCE(P.TOTIMP3,0)+COALESCE(P.TOTIMP4,0)+COALESCE(P.TOTIMP5,0)+COALESCE(P.TOTIMP6,0)+COALESCE(P.TOTIMP7,0)+COALESCE(P.TOTIMP8,0)";

    public async Task<SaeCommercialResult> ReadAsync(SaeConnectionProfile profile, string password,
        DateOnly from, DateOnly to, SaeCommercialFilter filter, CancellationToken token = default)
    {
        var watch = Stopwatch.StartNew();
        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(new FbTransactionOptions
            {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            }, token);
            var tables = new Tables(profile);
            var allRows = await ReadRows(connection, transaction, tables, from, to, filter, token);
            var rows = ReconcileAndFilter(allRows, filter);
            var brands = rows.GroupBy(x => x.Brand).Select(g => new SaeCommercialBrand(g.Key,
                g.Sum(x => x.Net), g.Sum(x => x.WithTax), g.Select(x => x.Doc).Distinct().Count(),
                g.Select(x => x.CustomerCode).Distinct().Count())).OrderByDescending(x => x.SalesWithoutTax).ThenBy(x => x.Brand).ToArray();
            var customers = rows.GroupBy(x => new { x.CustomerCode, x.CustomerName }).Select(g => new SaeCommercialCustomer(
                g.Key.CustomerCode, g.Key.CustomerName, g.Sum(x => x.Net), g.Sum(x => x.WithTax),
                g.Select(x => x.Doc).Distinct().Count(), g.GroupBy(x => x.Brand).Select(b => new SaeCommercialBrandAmount(
                    b.Key, b.Sum(x => x.Net), b.Sum(x => x.WithTax))).OrderByDescending(b => b.SalesWithoutTax).ToArray()))
                .OrderByDescending(x => x.SalesWithoutTax).ThenBy(x => x.CustomerCode).ToArray();
            var options = await ReadOptions(connection, transaction, tables, token);
            return new(true, "Facturación vigente por fecha de elaboración, conciliada con SAE.", from, to,
                rows.Sum(x => x.Net), rows.Sum(x => x.WithTax), rows.Select(x => x.Doc).Distinct().Count(), customers.Length,
                brands, customers, options.Sellers, options.Brands, options.Lines, watch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogError(ex, "Falló comercial SAE");
            return new(false, "No fue posible consultar el análisis comercial: " + ex.Message, from, to,
                0, 0, 0, 0, [], [], [], [], [], watch.ElapsedMilliseconds);
        }
    }

    public async Task<SaeCommercialCustomerPurchasesResult> ReadCustomerPurchasesAsync(
        SaeConnectionProfile profile, string password, DateOnly from, DateOnly to,
        SaeCommercialFilter filter, CancellationToken token = default)
    {
        var watch = Stopwatch.StartNew();
        try
        {
            await using var connection = FirebirdConnectionFactory.Create(profile, password);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(new FbTransactionOptions
            {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            }, token);
            var rows = ReconcileAndFilter(await ReadRows(connection, transaction, new Tables(profile), from, to, filter, token), filter);
            var sales = rows.Select(p => new CommercialProductSale(p.Doc, p.ElaborationDate, p.Brand,
                p.ProductCode, p.ProductName, p.Line, p.LineName, p.Unit, p.Quantity, p.Net, p.WithTax)).ToArray();
            return CommercialCustomerPurchases.Build(from, to, filter.Customer?.Trim() ?? "", rows.FirstOrDefault()?.CustomerName ?? "",
                sales, watch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogError(ex, "Falló el detalle comercial del cliente");
            return new(false, "No fue posible consultar los productos del cliente: " + ex.Message,
                from, to, filter.Customer?.Trim() ?? "", "", 0, 0, 0, 0, [], watch.ElapsedMilliseconds);
        }
    }

    private static Row[] ReconcileAndFilter(List<Row> allRows, SaeCommercialFilter filter)
    {
        var reconciled = new List<Row>();
        foreach (var invoice in allRows.GroupBy(x => x.Doc))
        {
            var parts = invoice.ToArray();
            var amounts = CommercialInvoiceAmounts.Reconcile(
                parts.Select(p => new CommercialPartAmount(p.Net, p.WithTax)).ToArray(),
                parts[0].InvoiceNet, parts[0].InvoiceTotal, parts[0].FinancialDiscount);
            reconciled.AddRange(parts.Select((p, i) => p with { Net = amounts[i].WithoutTax, WithTax = amounts[i].WithTax }));
        }
        return reconciled.Where(x =>
            (string.IsNullOrWhiteSpace(filter.Brand) || string.Equals(x.Brand, filter.Brand.Trim(), StringComparison.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(filter.ProductLine) || x.Line == filter.ProductLine.Trim())).ToArray();
    }

    private static async Task<List<Row>> ReadRows(FbConnection connection, FbTransaction transaction, Tables t,
        DateOnly from, DateOnly to, SaeCommercialFilter filter, CancellationToken token)
    {
        // SAE stores a kit and its priced components. Attribute the sale to
        // component brands/lines, without adding the kit a second time.
        var sql = $"""
            SELECT F.CVE_DOC, F.CVE_CLPV, COALESCE(C.NOMBRE,''),
                COALESCE(NULLIF(UPPER(TRIM(B.CAMPLIB1)),''),'Sin marca'),
                {Net}, ({Net})+({Tax}), COALESCE(TRIM(I.LIN_PROD),''),
                COALESCE(F.CAN_TOT,0)-COALESCE(F.DES_TOT,0)-COALESCE(F.DES_FIN,0),
                COALESCE(F.IMPORTE,0), COALESCE(F.DES_FIN,0),
                P.CVE_ART, COALESCE(NULLIF(TRIM(P.DESCR_ART),''),I.DESCR,P.CVE_ART),
                COALESCE(P.CANT,0), COALESCE(NULLIF(TRIM(P.UNI_VENTA),''),'Unidad'),
                COALESCE(F.FECHAELAB,F.FECHA_DOC), COALESCE(L.DESC_LIN,'')
            FROM {t.Fact} F JOIN {t.Par} P ON P.CVE_DOC=F.CVE_DOC
            LEFT JOIN {t.Inve} I ON I.CVE_ART=P.CVE_ART
            LEFT JOIN {t.Clib} B ON B.CVE_PROD=P.CVE_ART
            LEFT JOIN {t.Clie} C ON C.CLAVE=F.CVE_CLPV
            LEFT JOIN {t.Clin} L ON L.CVE_LIN=I.LIN_PROD
            WHERE COALESCE(F.FECHAELAB,F.FECHA_DOC)>=@from
                AND COALESCE(F.FECHAELAB,F.FECHA_DOC)<@to
                AND COALESCE(F.STATUS,'')<>'C'
                AND (CAST(@seller AS VARCHAR(10))='' OR TRIM(F.CVE_VEND)=CAST(@seller AS VARCHAR(10)))
                AND (CAST(@customer AS VARCHAR(20))='' OR TRIM(F.CVE_CLPV)=CAST(@customer AS VARCHAR(20)))
                AND (COALESCE(P.TIPO_PROD,'')<>'K' OR NOT EXISTS (
                    SELECT 1 FROM {t.Par} COMPONENT
                    WHERE COMPONENT.CVE_DOC=P.CVE_DOC AND COMPONENT.TIPO_ELEM='K'))
            ORDER BY F.CVE_DOC,P.NUM_PAR
            """;
        await using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 90 };
        command.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("to", to.AddDays(1).ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("seller", filter.SellerCode?.Trim() ?? "");
        command.Parameters.AddWithValue("customer", filter.Customer?.Trim() ?? "");
        var rows = new List<Row>();
        await using var reader = await command.ExecuteReaderAsync(token);
        string Text(int i) => Convert.ToString(reader.GetValue(i))?.Trim() ?? "";
        decimal Number(int i) => Convert.ToDecimal(reader.GetValue(i));
        while (await reader.ReadAsync(token))
            rows.Add(new(Text(0), Text(1), Text(2), Text(3), Number(4), Number(5), Text(6), Number(7), Number(8), Number(9),
                Text(10), Text(11), Number(12), Text(13), DateOnly.FromDateTime(reader.GetDateTime(14)), Text(15)));
        return rows;
    }

    private static async Task<(SaeCommercialOption[] Sellers, SaeCommercialOption[] Brands, SaeCommercialOption[] Lines)> ReadOptions(
        FbConnection connection, FbTransaction transaction, Tables t, CancellationToken token)
    {
        async Task<SaeCommercialOption[]> Query(string sql)
        {
            var options = new List<SaeCommercialOption>();
            await using var command = new FbCommand(sql, connection, transaction);
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token))
            {
                var value = Convert.ToString(reader.GetValue(0))?.Trim() ?? "";
                if (value.Length > 0) options.Add(new(value, (Convert.ToString(reader.GetValue(1)) ?? value).Trim()));
            }
            return options.ToArray();
        }
        var sellers = await Query($"SELECT CVE_VEND,NOMBRE FROM {t.Vend} ORDER BY NOMBRE");
        var brands = await Query($"SELECT DISTINCT UPPER(TRIM(CAMPLIB1)),UPPER(TRIM(CAMPLIB1)) FROM {t.Clib} WHERE TRIM(COALESCE(CAMPLIB1,''))<>'' ORDER BY 1");
        var lines = await Query($"SELECT CVE_LIN,DESC_LIN FROM {t.Clin} ORDER BY DESC_LIN");
        return (sellers, brands.Append(new("Sin marca", "Sin marca")).ToArray(), lines);
    }

    private sealed record Row(string Doc, string CustomerCode, string CustomerName, string Brand, decimal Net,
        decimal WithTax, string Line, decimal InvoiceNet, decimal InvoiceTotal, decimal FinancialDiscount,
        string ProductCode, string ProductName, decimal Quantity, string Unit, DateOnly ElaborationDate, string LineName);
    private sealed record Tables(string Fact, string Par, string Inve, string Clib, string Clie, string Vend, string Clin)
    {
        public Tables(SaeConnectionProfile p) : this(p.ResolveTableName("FACTF"), p.ResolveTableName("PAR_FACTF"),
            p.ResolveTableName("INVE"), p.ResolveTableName("INVE_CLIB"), p.ResolveTableName("CLIE"),
            p.ResolveTableName("VEND"), p.ResolveTableName("CLIN")) { }
    }
}

