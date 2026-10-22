@echo off
setlocal
title FloryMine Shop - Local Server

echo =============================================================
echo   FloryMine Shop - Local Server Launcher
echo =============================================================
echo.

:: 1. Check if node is in PATH
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "NODE_BIN=node"
    goto RUN
)

:: 2. Check WinGet package path
set "WINGET_NODE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\node.exe"
if exist "%WINGET_NODE%" (
    set "NODE_BIN=%WINGET_NODE%"
    goto RUN
)

:: 3. Check Program Files
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
    goto RUN
)

if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
    goto RUN
)

:: 4. Fallback to Python if node is missing
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Node.js not found, launching with Python...
    start http://localhost:3000
    python -m http.server 3000
    goto END
)

echo [ERROR] Neither Node.js nor Python was found.
echo Please install Node.js from https://nodejs.org
pause
goto END

:RUN
echo [OK] Found Node.js: "%NODE_BIN%"
echo.
echo Opening http://localhost:3000 in your browser...
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:3000"

echo Starting server.js...
echo.
"%NODE_BIN%" server.js

:END
endlocal
