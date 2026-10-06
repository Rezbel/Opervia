@echo off
set "OPERVIA_PWSH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
where pwsh.exe >nul 2>nul
if not errorlevel 1 (
  pwsh.exe -NoProfile -File "%~dp0scripts\start-local.ps1" %*
) else if exist "%OPERVIA_PWSH%" (
  "%OPERVIA_PWSH%" -NoProfile -File "%~dp0scripts\start-local.ps1" %*
) else (
  powershell.exe -NoProfile -File "%~dp0scripts\start-local.ps1" %*
)
if errorlevel 1 pause
