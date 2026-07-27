@echo off
setlocal
set "MQ_ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%MQ_ROOT%audit\run-audit.ps1"
set "MQ_EXIT=%ERRORLEVEL%"
echo.
if not "%MQ_EXIT%"=="0" echo Audit did not pass. Read audit\last-report.md.
if "%MQ_EXIT%"=="0" echo Audit passed.
pause
exit /b %MQ_EXIT%
