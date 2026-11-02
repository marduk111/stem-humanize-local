@echo off
setlocal
set "HERE=%~dp0"

if exist "%HERE%dist\portable\StemHumanizeServer.exe" (
  start "" "%HERE%dist\portable\StemHumanizeServer.exe"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No built app found and Node.js is not installed.
  echo Run build\build.ps1 once to create the standalone app, or install Node.js.
  echo.
  pause
  exit /b 1
)

start "" /min cmd /c "node "%HERE%build\dev-server.js""
exit /b 0
