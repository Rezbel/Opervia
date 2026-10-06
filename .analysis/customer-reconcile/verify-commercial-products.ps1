$ErrorActionPreference = 'Stop'
$connection = Invoke-RestMethod 'http://localhost:5106/api/connections/last-used'
$body = $connection | ConvertTo-Json
function Read-Commercial($path, $filter='') {
  $r = Invoke-RestMethod -Method Post -Uri "http://localhost:5106/api/sae/commercial$path`?from=2026-09-07&to=2026-10-06$filter" -ContentType 'application/json' -Body $body
  if (!$r.isSuccessful) { throw $r.message }; return $r
}
function Same($a, $b, $label) { if ([math]::Abs([decimal]$a-[decimal]$b) -gt 0.001) { throw "$label mismatch: $a / $b" } }
$base = Read-Commercial ''
foreach ($code in @('520','1326','1414','2035','1994')) {
  $customer = $base.customers | Where-Object customerCode -eq $code
  $detail = Read-Commercial '/customer-products' "&customer=$code"
  Same $detail.salesWithoutTax $customer.salesWithoutTax 'Customer net'
  Same $detail.salesWithTax $customer.salesWithTax 'Customer gross'
  Same $detail.invoiceCount $customer.invoiceCount 'Customer invoices'
  $products = @($detail.brands | ForEach-Object products)
  Same (($products | Measure-Object salesWithoutTax -Sum).Sum) $detail.salesWithoutTax 'Product net total'
  Same (($products | Measure-Object salesWithTax -Sum).Sum) $detail.salesWithTax 'Product gross total'
  Same (@($products | ForEach-Object productCode | Sort-Object -Unique).Count) $detail.productCount 'Distinct products'
  foreach ($p in $products) {
    Same (($p.purchases | Measure-Object quantity -Sum).Sum) $p.quantity 'Product quantities'
    Same (($p.purchases | Measure-Object salesWithoutTax -Sum).Sum) $p.salesWithoutTax 'Product invoice net'
    Same (($p.purchases | Measure-Object salesWithTax -Sum).Sum) $p.salesWithTax 'Product invoice gross'
    if (@($p.purchases | Where-Object { $_.elaborationDate -lt '2026-09-07' -or $_.elaborationDate -gt '2026-10-06' }).Count -gt 0) { throw 'Purchase outside period' }
  }
  foreach ($b in @($detail.brands | Select-Object -First 2)) {
    $filtered = Read-Commercial '/customer-products' ("&customer=$code&brand="+[uri]::EscapeDataString($b.brand))
    Same $filtered.salesWithoutTax $b.salesWithoutTax 'Brand filtered net'
    if ($filtered.brands.Count -ne 1 -or $filtered.brands[0].brand -ne $b.brand) { throw 'Brand filter leakage' }
  }
  [pscustomobject]@{Customer=$code;Products=$detail.productCount;Invoices=$detail.invoiceCount;Net=$detail.salesWithoutTax;Gross=$detail.salesWithTax;Ms=$detail.elapsedMilliseconds;Passed=$true} | ConvertTo-Json -Compress
  $detail | ConvertTo-Json -Depth 15 | Set-Content ".analysis/customer-reconcile/commercial-products-$code.json"
}
foreach ($filter in @('&seller=7&customer=865', '&customer=520&line=SP09', '&seller=7&brand=SPINREACT&customer=2009')) {
  $summary = Read-Commercial '' $filter
  $detail = Read-Commercial '/customer-products' $filter
  Same $detail.salesWithoutTax $summary.salesWithoutTax 'Combined filters net'
  Same $detail.salesWithTax $summary.salesWithTax 'Combined filters gross'
  Same $detail.invoiceCount $summary.invoiceCount 'Combined filters invoices'
}
$empty = Read-Commercial '/customer-products' '&customer=999999999999'
Same $empty.productCount 0 'No invented products'
try { $null = Read-Commercial '/customer-products'; throw 'Missing customer accepted' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw } }
'Customer product breakdown checks passed.'
