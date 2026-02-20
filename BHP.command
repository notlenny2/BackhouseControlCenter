#!/bin/bash
# BHP — Backhouse Productions
# Double-click this file in Finder to start the server

cd "$(dirname "$0")/server"

# Check Node.js is installed
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed."
  echo "Download it from https://nodejs.org"
  read -p "Press Enter to exit..."
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "Starting BHP server..."
echo "Press Ctrl+C to stop."
echo ""

npm start
