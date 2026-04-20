#!/bin/bash
echo "🕵️  Imposter Reactions — Starting..."
echo ""

# Install server deps
echo "📦 Installing server dependencies..."
cd server && npm install --silent
cd ..

# Install client deps
echo "📦 Installing client dependencies..."
cd client && npm install --silent
cd ..

echo ""
echo "🚀 Launching server on :3001 and client on :3000"
echo "   Press Ctrl+C to stop both"
echo ""

# Start both concurrently
(cd server && npm start) &
SERVER_PID=$!

(cd client && npm start) &
CLIENT_PID=$!

# Cleanup on exit
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT
wait
