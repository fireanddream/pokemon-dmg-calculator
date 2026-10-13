@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Install it, then run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies first...
  call npm install
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)

if not exist "dist\index.js" (
  echo Building the engine first...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

if "%~1"=="" (
  node scripts\damage.mjs
) else (
  node scripts\damage.mjs %*
)

echo.
pause
