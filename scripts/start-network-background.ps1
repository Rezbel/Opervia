param(
    [ValidateRange(1, 65535)][int]$Port = 10,
    [string]$ListenAddress = '0.0.0.0'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskLogs = Join-Path $taskRoot '.run'
[void](New-Item -ItemType Directory -Path $taskLogs -Force)
$taskBundled = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
$taskPowerShell = if (Test-Path -LiteralPath $taskBundled) { $taskBundled } else {
    Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
}
$taskScript = (Join-Path $PSScriptRoot 'start-network.ps1').Replace("'", "''")
$taskLog = (Join-Path $taskLogs 'network-startup.log').Replace("'", "''")
$taskAddress = $ListenAddress.Replace("'", "''")
$taskInvocation = "& '$taskScript' -Port $Port -ListenAddress '$taskAddress' *> '$taskLog'"
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($taskInvocation))
# Launch through the Windows desktop so the services are independent of the
# invoking terminal. ShowWindow 0 keeps the launcher hidden.
$taskShell = New-Object -ComObject Shell.Application
try {
    $taskShell.ShellExecute($taskPowerShell, "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $taskEncoded", $taskRoot, 'open', 0)
} finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($taskShell) }
Write-Host 'Opervia se esta iniciando en segundo plano.'
Write-Host "Registro de inicio: $(Join-Path $taskLogs 'network-startup.log')"
