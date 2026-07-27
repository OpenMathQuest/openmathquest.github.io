@echo off
setlocal
cd /d "%~dp0"
title Math Quest beta
rem Fixed Math Quest loopback port: 8771. Serve-MathQuest.ps1 verifies its identity.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Serve-MathQuest.ps1"
set "MQ_EXIT_CODE=%ERRORLEVEL%"

if not "%MQ_EXIT_CODE%"=="0" (
  echo.
  echo Math Quest could not start.
  echo Read the message above, then close this window or press any key.
  pause >nul
)

exit /b %MQ_EXIT_CODE%
