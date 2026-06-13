#!/bin/bash
set -e

echo "========================================="
echo "  MultiCloud Manager + AI Backend"
echo "========================================="

# Use shared PostgreSQL database
AI_BACKEND_PORT=${AI_BACKEND_PORT:-8077}
AI_BACKEND_DB_URL=${OPENCODE_DATABASE_URL:-${DATABASE_URL}}

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  [ -n "$AI_BACKEND_PID" ] && kill "$AI_BACKEND_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start AI Backend in background
echo "Starting AI Backend on port ${AI_BACKEND_PORT}..."
if [ -n "$AI_BACKEND_DB_URL" ]; then
  echo "Using PostgreSQL database"
  /app/ai-backend --port "${AI_BACKEND_PORT}" --db "$AI_BACKEND_DB_URL" &
else
  echo "Using SQLite database (local)"
  /app/ai-backend --port "${AI_BACKEND_PORT}" &
fi
AI_BACKEND_PID=$!

# Wait for AI Backend to be ready
echo "Waiting for AI Backend to start..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:${AI_BACKEND_PORT}/global/health > /dev/null 2>&1; then
    echo "AI Backend ready on port ${AI_BACKEND_PORT}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "AI Backend failed to start, continuing anyway..."
  fi
  sleep 1
done

# Start MultiCloud Manager backend
echo "Starting MultiCloud Manager on port ${PORT:-8099}..."
exec /app/multicloud
