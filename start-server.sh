#!/bin/bash
echo ""
echo "  ================================"
echo "    5 STAR LINKS - Download Server"
echo "  ================================"
echo ""
echo "  Starting server on http://localhost:4242"
echo "  Keep this window open while downloading"
echo "  Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
    echo "  ERROR: Node.js not found!"
    echo "  Download it from https://nodejs.org"
    exit 1
fi

# Open browser (macOS or Linux)
if command -v open &> /dev/null; then
    open http://localhost:4242/video.html &
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:4242/video.html &
fi

echo "  Opening browser..."
node server.js
