#!/bin/sh
LOG=/tmp/startup.log
exec 2>$LOG
set -x

echo "=== Startup $(date) ==="

opencode --version 2>&1

nohup opencode serve --port 4096 --hostname 0.0.0.0 >> /tmp/opencode.log 2>&1 &
echo "opencode PID: $!"
sleep 2

echo "Starting Go API..."
exec ./app
