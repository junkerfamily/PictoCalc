#!/bin/bash

# PictoCalc Launch Script for Mac
# Stops existing server, starts Node server, and opens browser

echo "🚀 Starting PictoCalc..."

cd "$(dirname "$0")"

# Kill any existing PictoCalc servers on port 8000
echo "🔄 Stopping existing servers..."
pkill -f "python3 -m http.server 8000" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
sleep 1

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing npm dependencies..."
  npm install
fi

# Start the Node server in the background
echo "🌐 Starting Node server on port 8000..."
node server.js > /tmp/pictocalc-server.log 2>&1 &
SERVER_PID=$!

# Check if server started successfully
sleep 1
if curl -s http://localhost:8000 > /dev/null; then
    echo "✅ Server started successfully"
else
    echo "❌ Server failed to start — see /tmp/pictocalc-server.log"
    exit 1
fi

# Open the page in Chrome
echo "🌍 Opening http://localhost:8000 in Chrome..."
open -a "Google Chrome" --new --args --new-window http://localhost:8000

echo "✅ PictoCalc is running!"
echo "📊 Server PID: $SERVER_PID"
echo "🌐 Calculator: http://localhost:8000"
echo "🔐 Admin:      http://localhost:8000/admin.html  (default login: admin / changeme)"
echo "🛑 To stop: kill $SERVER_PID"
echo ""
echo "💡 Change the admin password by creating a .env file (see .env.example)"
