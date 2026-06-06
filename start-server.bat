@echo off
title 5 Star Links - Download Server
echo.
echo   ================================
echo     5 STAR LINKS - Download Server
echo   ================================
echo.
echo   Starting server on http://localhost:4242
echo   Keep this window open while downloading
echo   Press Ctrl+C to stop
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Node.js not found!
    echo   Download it from https://nodejs.org
    pause
    exit /b 1
)

where yt-dlp >nul 2>&1
if %errorlevel% neq 0 (
    echo   WARNING: yt-dlp not found in PATH
    echo   Downloads may not work without it
    echo.
)

echo   Opening browser...
start http://localhost:4242/video.html
echo.

node server.js
