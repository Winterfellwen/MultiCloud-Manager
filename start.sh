#!/bin/sh
LOG=/tmp/startup.log
exec 2>$LOG
set -x

echo "=== Startup $(date) ==="
echo "PATH=$PATH"
echo "Home=$HOME"

# Check if opencode binary exists
if [ -f /root/.opencode/bin/opencode ]; then
  echo "opencode binary found"
  /root/.opencode/bin/opencode --version 2>&1
else
  echo "ERROR: opencode binary not found at /root/.opencode/bin/opencode"
  ls -la /root/.opencode/bin/ 2>&1 || echo "Directory missing"
fi

# Try starting opencode
echo "Starting opencode..."
nohup /root/.opencode/bin/opencode serve --port 4096 --hostname 0.0.0.0 >> /tmp/opencode.log 2>&1 &
echo "opencode PID: $!"
sleep 2
ps aux 2>&1 || true

echo "Starting Go API..."
exec ./app
