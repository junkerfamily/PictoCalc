@echo off
REM PictoCalc Launch Script for Windows
REM Stops existing server, starts Node server, and opens browser

echo Starting PictoCalc...

cd /d "%~dp0"

REM Kill any existing servers on port 8000 (best effort)
echo Stopping existing servers...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 1 /nobreak >nul

REM Install deps if needed
if not exist "node_modules\" (
  echo Installing npm dependencies...
  call npm install
)

REM Start the Node server
echo Starting Node server on port 8000...
start /B node server.js

REM Wait for server to start
timeout /t 2 /nobreak >nul

REM Open the page in the default browser
echo Opening http://localhost:8000 in browser...
start http://localhost:8000

echo PictoCalc is running!
echo Calculator: http://localhost:8000
echo Admin:      http://localhost:8000/admin.html  (default login: admin / changeme)
echo.
echo Change the admin password by creating a .env file (see .env.example)
pause
