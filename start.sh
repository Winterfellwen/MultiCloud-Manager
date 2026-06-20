#!/bin/sh

# 启动所有后端服务
echo "Starting backend services..."
pm2 start ecosystem.config.js

# 等待服务启动
sleep 5

# 启动 nginx
echo "Starting nginx..."
nginx -g 'daemon off;'