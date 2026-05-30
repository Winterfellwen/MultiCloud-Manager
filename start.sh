#!/bin/sh
set -e

echo "Starting opencode server on :4096 ..."
/root/.opencode/bin/opencode serve --port 4096 --hostname 0.0.0.0 &
OPCODE_PID=$!
sleep 2
if kill -0 $OPCODE_PID 2>/dev/null; then
  echo "opencode started (PID $OPCODE_PID)"
else
  echo "ERROR: opencode failed to start"
fi

echo "Starting Go API on :8099 ..."
exec ./app
