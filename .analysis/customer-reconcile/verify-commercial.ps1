$ErrorActionPreference = 'Stop'
$connection = Invoke-RestMethod 'http://localhost:5106/api/connections/last-used'
$body = $connection | ConvertTo-Json
function Read-Commercial($from, $to, $filters='') {
    Start-Sleep -Milliseconds 1100
    for ($attempt=0; $attempt -lt 4; $attempt++) {
        try { $r = Invoke-RestMethod -Method Post -Uri "http://localhost:5106/api/sae/commercial?from=$from&to=$to$filters" -ContentType 'application/json' -Body $body; break }
        catch { if ($_.Exception.Response.StatusCode.value__ -ne 429 -or $attempt -eq 3) { throw }; Start-Sleep -Seconds 20 }
    }
    if (!$r.isSuccessful) { throw $r.message }
    return $r
}
function Check-Equal($a, $b, $label) { if ([math]::Abs([decimal]$a-[decimal]$b) -gt 0.001) { throw "$label mismatch: $a / $b" } }
function Check-Summary($r) {
    Check-Equal (($r.brands | Measure-Object salesWithoutTax -Sum).Sum) $r.salesWithoutTax 'Brand net sum'
    Check-Equal (($r.brands | Measure-Object salesWithTax -Sum).Sum) $r.salesWithTax 'Brand gross sum'
    Check-Equal (($r.customers | Measure-Object salesWithoutTax -Sum).Sum) $r.salesWithoutTax 'Customer net sum'
    Check-Equal (($r.customers | Measure-Object salesWithTax -Sum).Sum) $r.salesWithTax 'Customer gross sum'
    Check-Equal $r.customers.Count $r.customerCount 'Customer count'
    foreach ($c in $r.customers) {
        Check-Equal (($c.brands | Measure-Object salesWithoutTax -Sum).Sum) $c.salesWithoutTax 'Matrix row net'
        Check-Equal (($c.brands | Measure-Object salesWithTax -Sum).Sum) $c.salesWithTax 'Matrix row gross'
    }
    foreach ($b in $r.brands) {
        $cells = @($r.customers | ForEach-Object { $_.brands | Where-Object brand -eq $b.brand })
        Check-Equal (($cells | Measure-Object salesWithoutTax -Sum).Sum) $b.salesWithoutTax 'Matrix column'
        Check-Equal $cells.Count $b.customerCount 'Brand customer count'
    }
}
$queries = @{}
$results = @{}
foreach ($period in @(@('today','2026-10-06','2026-10-06'),@('month','2026-10-01','2026-10-06'),@('30days','2026-09-07','2026-10-06'),@('september','2026-09-01','2026-09-30'),@('year','2026-01-01','2026-10-06'))) {
    $r = Read-Commercial $period[1] $period[2]
    Check-Summary $r
    $results[$period[0]] = $r
    $end = ([datetime]$period[2]).AddDays(1).ToString('yyyy-MM-dd')
    $queries[$period[0]] = "SELECT COUNT(*) N,COUNT(DISTINCT CVE_CLPV) CUSTOMERS,SUM(ROUND(CAN_TOT-DES_TOT-DES_FIN,2)) NETO,SUM(ROUND(IMPORTE,2)) TOTAL FROM FACTF15 WHERE COALESCE(FECHAELAB,FECHA_DOC)>='$($period[1])' AND COALESCE(FECHAELAB,FECHA_DOC)<'$end' AND STATUS<>'C'"
    [pscustomobject]@{Test=$period[0];Invoices=$r.invoiceCount;Customers=$r.customerCount;Net=$r.salesWithoutTax;Gross=$r.salesWithTax;Ms=$r.elapsedMilliseconds} | ConvertTo-Json -Compress
}
foreach ($seller in @('1','7','18','21')) {
    $r = Read-Commercial '2026-09-07' '2026-10-06' "&seller=$seller"
    Check-Summary $r
    $results["seller$seller"]=$r
    $queries["seller$seller"] = "SELECT COUNT(*) N,COUNT(DISTINCT CVE_CLPV) CUSTOMERS,SUM(ROUND(CAN_TOT-DES_TOT-DES_FIN,2)) NETO,SUM(ROUND(IMPORTE,2)) TOTAL FROM FACTF15 WHERE COALESCE(FECHAELAB,FECHA_DOC)>='2026-09-07' AND COALESCE(FECHAELAB,FECHA_DOC)<'2026-10-07' AND STATUS<>'C' AND TRIM(CVE_VEND)='$seller'"
}
$base = $results['30days']
foreach ($b in $base.brands) {
    $r = Read-Commercial '2026-09-07' '2026-10-06' ('&brand='+[uri]::EscapeDataString($b.brand))
    Check-Summary $r
    Check-Equal $r.salesWithoutTax $b.salesWithoutTax 'Brand filter net'
    Check-Equal $r.salesWithTax $b.salesWithTax 'Brand filter gross'
    Check-Equal $r.invoiceCount $b.invoiceCount 'Brand invoice count'
    if ($r.brands.Count -ne 1 -or $r.brands[0].brand -ne $b.brand) { throw 'Brand filter leakage' }
}
foreach ($c in @($base.customers | Select-Object -First 5)) {
    $r = Read-Commercial '2026-09-07' '2026-10-06' ('&customer='+$c.customerCode)
    Check-Summary $r
    Check-Equal $r.salesWithoutTax $c.salesWithoutTax 'Customer filter'
    Check-Equal $r.invoiceCount $c.invoiceCount 'Customer invoice count'
}
foreach ($line in @($base.productLines | Where-Object { $_.label -match 'REACTIVO MAGLUMI|SEROLOGIA SPIN|BESELTA PBA RAPIDA' } | Select-Object -First 3 -ExpandProperty value)) {
    $r = Read-Commercial '2026-09-07' '2026-10-06' ('&line='+$line)
    Check-Summary $r
    foreach ($b in $r.brands) {
        $combined = Read-Commercial '2026-09-07' '2026-10-06' ('&line='+$line+'&brand='+[uri]::EscapeDataString($b.brand))
        Check-Equal $combined.salesWithoutTax $b.salesWithoutTax 'Combined line/brand filter'
    }
}
$r = Read-Commercial '2026-10-06' '2026-10-06' '&seller=99999'
Check-Equal $r.invoiceCount 0 'Empty filter'
$queries | ConvertTo-Json | Set-Content .analysis/customer-reconcile/commercial-header-queries.json
$results | ConvertTo-Json -Depth 12 | Set-Content .analysis/customer-reconcile/commercial-api-results.json
"Verified $($base.brands.Count) brand filters and matrix reconciliation; seller, customer and combined filters passed."

