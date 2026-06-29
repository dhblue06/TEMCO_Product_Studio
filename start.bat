@echo off
title TEMCO Product Studio
echo ========================================
echo   TEMCO Product Studio - Quick Start
echo ========================================
echo.

echo [1/3] Starting backend server...
start "TEMCO-Backend" cmd /c "cd /d %~dp0server && npx tsx src/index.ts"

echo       Waiting 6 seconds...
ping -n 6 127.0.0.1 >nul

echo [2/3] Starting frontend server...
start "TEMCO-Frontend" cmd /c "cd /d %~dp0client && npx vite --host"

echo       Waiting 4 seconds...
ping -n 4 127.0.0.1 >nul

echo [3/3] Opening browser...
start "" "http://localhost:5173"

echo.
echo ========================================
echo   Ready!
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo.
echo   If browser didn't open, visit http://localhost:5173
echo   Close the two terminal windows to stop.
echo ========================================
echo.
pause
