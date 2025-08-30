#!/bin/bash

# PictoCalc Launch Script for Mac
# Stops existing server, starts fresh server, and opens browser

echo "🚀 Starting PictoCalc..."

# Kill any existing python http server on port 8000
echo "🔄 Stopping existing servers..."
pkill -f "python3 -m http.server 8000" 2>/dev/null || true
sleep 2

# Start the HTTP server in the background
echo "🌐 Starting HTTP server on port 8000..."
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!

# Check if server started successfully
sleep 1
if curl -s http://localhost:8000 > /dev/null; then
    echo "✅ Server started successfully"
else
    echo "❌ Server failed to start"
fi

# Wait a moment for server to start
sleep 2

# Choose browser (you can modify this line to specify your preferred browser)
#BROWSER_CMD="open"  # Default browser
BROWSER_CMD="open -a Google\ Chrome -n --args --new-window"     # Force Chrome with new window
# BROWSER_CMD="open -a 'Safari'"            # Force Safari
# BROWSER_CMD="open -a 'Firefox'"           # Force Firefox

# Open the page in the browser
echo "🌍 Opening http://localhost:8000 in Chrome..."
open -a "Google Chrome" --new --args --new-window http://localhost:8000

echo "✅ PictoCalc is running!"
echo "📊 Server PID: $SERVER_PID"
echo "🌐 URL: http://localhost:8000"
echo "🛑 To stop: pkill -f 'python3 -m http.server 8000'"
echo ""
echo "💡 Mac Browser Console Shortcuts:"
echo "   Chrome/Edge: Cmd + Option + I"
echo "   Safari: Cmd + Option + C (enable Developer menu first)"
echo "   Firefox: Cmd + Option + I"
echo ""
echo "🔧 To change browser, edit launch.sh and uncomment your preferred BROWSER_CMD line"
