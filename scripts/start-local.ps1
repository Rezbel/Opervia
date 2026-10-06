param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$logs = Join-Path $root '.run'
New-Item -ItemType Directory -Force $logs | Out-Null
function Find-Tool($name, $fallback) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in $fallback) { if (Test-Path $candidate) { return $candidate } }
    throw "No se encontro $name. Instala el requisito y vuelve a iniciar."
}
$dotnet = Find-Tool 'dotnet.exe' @("$env:LOCALAPPDATA/Microsoft/dotnet/dotnet.exe", "$env:ProgramFiles/dotnet/dotnet.exe")
$node = Find-Tool 'node.exe' @("$env:ProgramFiles/nodejs/node.exe", "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe")
$env:PATH = "$(Split-Path $dotnet);$(Split-Path $node);$env:PATH"
$env:DOTNET_ROOT = Split-Path $dotnet
$web = Join-Path $root 'src/Opervia.Web'
if (!(Test-Path "$web/node_modules/vite/bin/vite.js")) {
    Push-Location $web
    try {
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if ($npm) { & $npm.Source ci }
        elseif (Test-Path "$env:LOCALAPPDATA/Microsoft/opervia-npm/package/bin/npm-cli.js") {
            & $node "$env:LOCALAPPDATA/Microsoft/opervia-npm/package/bin/npm-cli.js" ci
        } else { throw 'Instala Node.js con npm para descargar las dependencias.' }
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion del frontend.' }
    } finally { Pop-Location }
}
function Is-Ready($url) {
    try { return (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { return $false }
}
function Wait-Ready($url, $process, $name) {
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if (Is-Ready $url) { return }
        if ($process.HasExited) { throw "$name termino. Revisa los registros en $logs." }
        Start-Sleep -Milliseconds 700
    }
    throw "$name no respondio. Revisa los registros en $logs."
}
if (!(Is-Ready 'http://127.0.0.1:5106/api/connections')) {
    & $dotnet build (Join-Path $root 'src/Opervia.Api/Opervia.Api.csproj') --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion de la API.' }
    $api = Start-Process $dotnet -ArgumentList @('run', '--no-build', '--project', 'src/Opervia.Api/Opervia.Api.csproj', '--launch-profile', 'http') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logs/api.out.log" -RedirectStandardError "$logs/api.err.log"
    $api.Id | Set-Content "$logs/api.pid"
    Wait-Ready 'http://127.0.0.1:5106/api/connections' $api 'api'
}
if (!(Is-Ready 'http://127.0.0.1:5173/')) {
    $page = Start-Process $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $web -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logs/web.out.log" -RedirectStandardError "$logs/web.err.log"
    $page.Id | Set-Content "$logs/web.pid"
    Wait-Ready 'http://127.0.0.1:5173/' $page 'web'
}
Write-Host 'Opervia lista: http://localhost:5173/' -ForegroundColor Green
Write-Host 'SAE requiere tu conexion Firebird. La IA requiere Ollama con qwen3:4b.'
if (!$NoBrowser) { Start-Process 'http://localhost:5173/' }
