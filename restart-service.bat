@echo off
title BHP - Restart Service
cd /d "%~dp0"
setlocal EnableExtensions

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo Run this as Administrator.
  pause
  exit /b 1
)

set "NSSM_EXE=%~dp0tools\nssm\nssm.exe"
set "FFMPEG_PATH_VALUE=C:\Users\Golf\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"
if not exist "%NSSM_EXE%" (
  echo NSSM not found: %NSSM_EXE%
  echo Run setup-service.bat first or start manually with BHP.bat
  pause
  exit /b 1
)

echo Configuring FFmpeg path for service...
"%NSSM_EXE%" set BHP-Server AppEnvironmentExtra "FFMPEG_PATH=%FFMPEG_PATH_VALUE%" >nul 2>&1

echo Stopping BHP-Server...
"%NSSM_EXE%" stop BHP-Server >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting BHP-Server...
"%NSSM_EXE%" start BHP-Server >nul 2>&1
timeout /t 2 /nobreak >nul

echo Service status:
"%NSSM_EXE%" status BHP-Server
echo.
pause
exit /b 0
