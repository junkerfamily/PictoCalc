@echo off
REM PictoCalc Launch Script for Windows
REM Stops existing server, starts fresh server, and opens browser

echo 🚀 Starting PictoCalc...

REM Kill any existing python http server on port 8000
echo 🔄 Stopping existing servers...
taskkill /F /IM python.exe 2>nul

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start the HTTP server
echo 🌐 Starting HTTP server on port 8000...
start /B python -m http.server 8000

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Open the page in the default browser
echo 🌍 Opening http://localhost:8000 in browser...
start http://localhost:8000

echo ✅ PictoCalc is running!
echo 🌐 URL: http://localhost:8000
echo 🛑 To stop: taskkill /F /IM python.exe
echo.
echo 💡 Open browser console (F12 → Console) to see debug logs
pause
