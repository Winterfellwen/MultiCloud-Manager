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

# 更新 nginx 配置中的监听端口（替换占位符）
sed -i "s/__NGINX_PORT__/$NGINX_PORT/g" /etc/nginx/nginx.conf 2>/dev/null || true

# 测试 nginx 配置是否有效
nginx -t 2>&1 || true

# 启动所有后端服务
echo "Starting backend services..."
pm2 start /app/ecosystem.config.js

# 等待服务启动（等待 api-gateway 就绪）
echo "Waiting for services to start..."
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
    echo "api-gateway is ready after $((i * 2)) seconds"
    break
  fi
  sleep 2
done

# 启动 nginx
echo "Starting nginx on port $NGINX_PORT..."
nginx -g 'daemon off;'