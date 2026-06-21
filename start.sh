#!/bin/sh

echo "=== Starting CloudOps Deployment ==="
echo "Environment variables:"
env | grep -E "(PORT|DATABASE|JWT|REDIS|NODE|SERVICE_URL)" | sort

# Render 设置 PORT 环境变量
NGINX_PORT=${PORT:-80}
echo ""
echo "NGINX_PORT: $NGINX_PORT"

# 替换 nginx 配置中的端口占位符
echo "Configuring nginx to listen on port $NGINX_PORT..."
sed -i "s/__NGINX_PORT__/$NGINX_PORT/g" /etc/nginx/nginx.conf

# 验证 nginx 配置
echo "Testing nginx configuration..."
nginx -t 2>&1 || {
    echo "WARNING: nginx config test failed, continuing anyway"
}

# 启动 PM2 服务
echo ""
echo "Starting backend services with PM2..."
cd /app
pm2 start /app/ecosystem.config.js 2>&1
pm2 list 2>&1 || true

# 等待 api-gateway 就绪（最多等待 60 秒）
echo ""
echo "Waiting for api-gateway to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
        echo "✓ api-gateway is ready after $((i * 2)) seconds"
        break
    fi
    sleep 2
done

# 检查 cloud-service 和 auth-service
echo "Checking other services..."
for svc in cloud-service auth-service; do
    case $svc in
        cloud-service)  port=3001 ;;
        auth-service)   port=3004 ;;
    esac
    if curl -sf http://127.0.0.1:$port/health > /dev/null 2>&1; then
        echo "✓ $svc is ready"
    else
        echo "✗ $svc is not responding on port $port"
    fi
done

# 启动 nginx（前台模式）
echo ""
echo "Starting nginx on port $NGINX_PORT..."
echo "=== Service startup complete ==="
nginx -g 'daemon off;'
