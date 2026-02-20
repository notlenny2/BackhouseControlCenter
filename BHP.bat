@echo off
title BHP — Backhouse Productions
cd /d "%~dp0server"

echo ==========================================
echo   BHP — Backhouse Productions
echo ==========================================
echo.

REM Check Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Download it from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo npm version:
npm --version
echo.

REM Always run npm install to ensure deps are up to date
echo Installing / verifying dependencies...
npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: npm install failed ^(see above^).
    echo.
    pause
    exit /b 1
)

echo.
echo Starting BHP server...
echo Press Ctrl+C to stop.
echo.

node index.js

echo.
echo ==========================================
echo   Server stopped.
echo ==========================================
pause
