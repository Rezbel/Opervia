$ErrorActionPreference='Stop'
$connection=Invoke-RestMethod 'http://localhost:5106/api/connections/last-used'
$body=$connection|ConvertTo-Json
$base='http://localhost:5106/api/sae/receivables/invoices?from=2026-09-06&to=2026-10-06'
function Read-Invoices($query) {
    $result=Invoke-RestMethod -Method Post -Uri ($base+$query) -ContentType 'application/json' -Body $body
    if(!$result.isSuccessful){throw $result.message}
    return $result
}
foreach($size in @(10,30,60,100)) {
    $first=Read-Invoices ('&page=1&pageSize='+$size)
    $next=Read-Invoices ('&page=2&pageSize='+$size)
    if($first.invoices.Count -ne $size -or $next.invoices.Count -ne $size){throw 'Pagination size failed'}
    if($first.totalInvoiceCount -ne $next.totalInvoiceCount){throw 'Pagination total failed'}
    if(@($next.invoices | Where-Object {$_.invoiceNumber -in $first.invoices.invoiceNumber}).Count -gt 0){throw 'Repeated invoices between pages'}
    [pscustomobject]@{Test='Pagination';Size=$size;Count=$first.totalInvoiceCount;ServerMs=$first.elapsedMilliseconds;Passed=$true}|ConvertTo-Json -Compress
}
$plain=Read-Invoices '&search=sofia'
$accent=Read-Invoices ('&search='+[uri]::EscapeDataString('Sofía'))
if(($plain.invoices.invoiceNumber -join ',') -ne ($accent.invoices.invoiceNumber -join ',') -or $plain.totalInvoiceCount -ne 2){throw 'Accent search failed'}
$folio=Read-Invoices '&search=FXA6303'
if($folio.totalInvoiceCount -ne 1 -or $folio.invoices[0].invoiceNumber -ne 'F-XA-006303'){throw 'Invoice normalization failed'}
$customer=Read-Invoices '&search=1742'
if(@($customer.invoices | Where-Object customerCode -ne '1742').Count -gt 0 -or $customer.totalInvoiceCount -ne 6){throw 'Customer code search failed'}
$words=Read-Invoices '&search=patricia%20maria'
if(($words.invoices.invoiceNumber -join ',') -ne ($customer.invoices.invoiceNumber -join ',')){throw 'Word order search failed'}
$empty=Read-Invoices '&search=zzzzzzzz'
if($empty.totalInvoiceCount -ne 0 -or $empty.invoices.Count -ne 0){throw 'Empty search failed'}
$last=Read-Invoices '&page=100000&pageSize=10'
if($last.invoicePage -ne [math]::Ceiling($last.totalInvoiceCount/10) -or $last.invoices.Count -eq 0){throw 'Page clamp failed'}
try {$null=Read-Invoices ('&search='+('a'*121)); throw 'Search limit accepted'} catch {if($_.Exception.Response.StatusCode.value__ -ne 400){throw}}
'All live invoice search checks passed.'
