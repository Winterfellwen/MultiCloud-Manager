#!/bin/sh

# 加载环境变量
if [ -f /app/.env ]; then
  echo "Loading environment variables from .env..."
  set -a
  . /app/.env
  set +a
fi

# Render 会设置 PORT 环境变量，动态配置 nginx 监听该端口
NGINX_PORT=${PORT:-80}
echo "NGINX_PORT: $NGINX_PORT"

# 更新 nginx 配置中的监听端口
sed -i "s/listen 80;/listen $NGINX_PORT;/" /etc/nginx/http.d/default.conf 2>/dev/null || true

# 启动所有后端服务
echo "Starting backend services..."
pm2 start ecosystem.config.js

# 等待服务启动
sleep 5

# 启动 nginx
echo "Starting nginx on port $NGINX_PORT..."
nginx -g 'daemon off;'