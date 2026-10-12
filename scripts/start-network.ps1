param(
    [ValidateRange(1, 65535)][int]$Port = 10,
    [string]$ListenAddress = '0.0.0.0'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskWeb = Join-Path $taskRoot 'src/Opervia.Web'
$taskLogs = Join-Path $taskRoot '.run'
[void](New-Item -ItemType Directory -Path $taskLogs -Force)

# Keep the existing local service and connection profiles.
& (Join-Path $PSScriptRoot 'start-local.ps1') -NoBrowser

$taskNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$taskNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (!(Test-Path -LiteralPath $taskNode)) { throw 'No se encontro Node.js.' }

$taskPidFile = Join-Path $taskLogs "network-$Port.pid"
if (Test-Path -LiteralPath $taskPidFile) {
    $taskPreviousId = [int](Get-Content -LiteralPath $taskPidFile -Raw)
    $taskPrevious = Get-CimInstance Win32_Process -Filter "ProcessId = $taskPreviousId"
    if ($taskPrevious -and $taskPrevious.CommandLine -like '*scripts/serve-network.mjs*') {
        Stop-Process -Id $taskPreviousId
    }
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto $Port esta ocupado. Usa -Port con otro numero."
}

# A same-origin base makes browser requests use this server's /api proxy.
$taskPreviousApiUrl = $env:VITE_API_URL
$taskPreviousErrorPreference = $ErrorActionPreference
Push-Location $taskWeb
try {
    # '/' survives Windows PowerShell's handling of empty environment values.
    # The frontend removes the trailing slash and uses relative /api URLs.
    $env:VITE_API_URL = '/'
    # Windows PowerShell treats native stderr warnings as PowerShell errors.
    # The actual build result is checked through LASTEXITCODE instead.
    $ErrorActionPreference = 'Continue'
    & $taskNode 'node_modules/typescript/bin/tsc' -b
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la comprobacion del frontend.' }
    & $taskNode 'node_modules/vite/bin/vite.js' build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion del frontend.' }
} finally {
    $ErrorActionPreference = $taskPreviousErrorPreference
    if ($null -eq $taskPreviousApiUrl) {
        Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
    } else { $env:VITE_API_URL = $taskPreviousApiUrl }
    Pop-Location
}

$taskServer = Start-Process -FilePath $taskNode -ArgumentList @('scripts/serve-network.mjs', $ListenAddress, "$Port") -WorkingDirectory $taskWeb -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogs "network-$Port.out.log") -RedirectStandardError (Join-Path $taskLogs "network-$Port.err.log")
$taskServer.Id | Set-Content -LiteralPath $taskPidFile
$taskCheckAddress = if ($ListenAddress -eq '0.0.0.0') { '127.0.0.1' } else { $ListenAddress }
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    $taskServer.Refresh()
    if ($taskServer.HasExited) { throw "El servidor termino. Revisa .run/network-$Port.err.log." }
    try {
        $taskResponse = Invoke-WebRequest "http://${taskCheckAddress}:$Port/api/health" -UseBasicParsing -TimeoutSec 2
        if ($taskResponse.StatusCode -eq 200) { $taskReady = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (!$taskReady) { throw 'La aplicacion no respondio a la comprobacion de inicio.' }
Write-Host "Opervia publicada en el puerto $Port." -ForegroundColor Green
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
    ($ListenAddress -eq '0.0.0.0' -or $_.IPAddress -eq $ListenAddress)
} | ForEach-Object { Write-Host "http://$($_.IPAddress):$Port/" }
