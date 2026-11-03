#!/bin/bash

# Start Ollama (if not running)
if ! pgrep -x "ollama" > /dev/null; then
  echo "Starting Ollama..."
  ollama serve &
fi

# Start Docker (Colima version)
if ! colima status | grep -q "Running"; then
  echo "Starting Colima..."
  colima start
fi