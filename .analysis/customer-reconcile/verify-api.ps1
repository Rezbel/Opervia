$ErrorActionPreference = 'Stop'
$connection = Invoke-RestMethod 'http://localhost:5106/api/connections/last-used'
$body = $connection | ConvertTo-Json
$base = 'http://localhost:5106/api/sae/customers/portfolio?from=2026-10-06&to=2026-10-06'
function Read-Portfolio($query) {
    $response = Invoke-RestMethod -Method Post -Uri ($base + $query) -ContentType 'application/json' -Body $body
    if (!$response.isSuccessful) { throw $response.message }
    return $response
}
$list = Read-Portfolio ''
$checks = @(
    @{ Query='&seller=7'; Match={param($c) $c.sellerCode -eq '7'} },
    @{ Query='&state=M'; Match={param($c) $c.customerStatus -eq 'M'} },
    @{ Query='&state=S'; Match={param($c) $c.customerStatus -eq 'S'} },
    @{ Query='&state=B'; Match={param($c) $c.customerStatus -eq 'B'} },
    @{ Query='&branch=Q'; Match={param($c) $c.classification.StartsWith('Q')} },
    @{ Query='&customerType=L'; Match={param($c) $c.classification.Length -ge 3 -and $c.classification.Substring(2,1) -eq 'L'} },
    @{ Query='&classification=A'; Match={param($c) $c.classification.Length -ge 4 -and $c.classification.Substring(3,1) -eq 'A'} },
    @{ Query='&credit=3'; Match={param($c) $c.classification.Length -ge 5 -and $c.classification.Substring(4,1) -eq '3'} },
    @{ Query='&seller=7&branch=Q&state=A&credit=3'; Match={param($c) $c.sellerCode -eq '7' -and $c.customerStatus -eq 'A' -and $c.classification.StartsWith('Q') -and $c.classification.EndsWith('3')} }
)
foreach ($check in $checks) {
    $expected = @($list.customers | Where-Object { & $check.Match $_ } | ForEach-Object customerCode)
    $actual = @((Read-Portfolio $check.Query).customers | ForEach-Object customerCode)
    if ($expected.Count -ne $actual.Count -or @($expected | Where-Object {$_ -notin $actual}).Count -gt 0) { throw ('Filter failed: '+$check.Query) }
    [pscustomobject]@{Test=$check.Query; Count=$actual.Count; Passed=$true} | ConvertTo-Json -Compress
}
foreach ($code in @('845','865','1994','1650','67','231','271','438','520','1515','1776','1880','2018','2126','2333')) {
    $detail = Read-Portfolio ('&customer='+$code)
    if ($detail.customers.Count -ne 1) { throw 'Customer missing' }
    $sum = ($detail.invoices | Measure-Object amount -Sum).Sum
    if ([math]::Abs($sum-$detail.pendingInvoiceBalance) -gt 0.001) { throw 'Invoice sum mismatch' }
    if ([math]::Abs($detail.pendingInvoiceBalance-$detail.creditBalance+$detail.otherAccountBalance-$detail.accountingBalance) -gt 0.001) { throw 'Reconciliation mismatch' }
    if (@($detail.invoices | Where-Object {$_.amount -le 0.005 -or $_.status -notin @('Vencido','Adeudo')}).Count -gt 0) { throw 'Invalid pending invoice' }
    [pscustomobject]@{Client=$code; Count=$detail.invoices.Count; Catalog=$detail.customers[0].balance; Invoices=$detail.pendingInvoiceBalance; Other=$detail.otherAccountBalance; Credit=$detail.creditBalance; Difference=[math]::Round($detail.balanceDifference,4); Passed=$true} | ConvertTo-Json -Compress
}
$legacy = Read-Portfolio '&customer=1515'
if ([math]::Abs($legacy.pendingInvoiceBalance-1870139.9) -gt 0.001 -or !($legacy.invoices | Where-Object invoiceNumber -eq 'QR66299')) { throw 'Historical invoice charges are missing' }
$partial = (Read-Portfolio '&customer=520').invoices | Where-Object invoiceNumber -eq 'F-QR-080837'
if ([math]::Abs($partial.amount-992.96) -gt 0.001 -or [math]::Abs($partial.originalAmount-28113.95) -gt 0.001) { throw 'Partial payment calculation failed' }
if ((Read-Portfolio '&customer=845&seller=7').customers.Count -ne 0) { throw 'Selected customer bypassed filters' }
try { $null = Read-Portfolio '&state=INVALID'; throw 'Invalid filter accepted' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw } }
'All customer portfolio checks passed.'
