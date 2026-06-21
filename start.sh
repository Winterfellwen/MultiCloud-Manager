#!/bin/sh

echo "============================================"
echo "  CloudOps Platform - Starting Services"
echo "============================================"
echo ""

# 环境变量信息
echo "--- Environment Variables ---"
echo "PORT: $PORT"
echo "DATABASE_URL: ${DATABASE_URL:0:40}"
echo "JWT_SECRET: ${JWT_SECRET:0:30}"
echo "REDIS_URL: ${REDIS_URL:0:40}"
echo "AUTH_SERVICE_URL: $AUTH_SERVICE_URL"
echo "CLOUD_SERVICE_URL: $CLOUD_SERVICE_URL"
echo ""

NGINX_PORT=${PORT:-80}
echo "NGINX_PORT: $NGINX_PORT"
echo ""

# 更新 nginx 配置
echo "--- Configuring nginx port..."
sed -i "s/__NGINX_PORT__/$NGINX_PORT/g" /etc/nginx/nginx.conf
nginx -t 2>&1 || echo "WARNING: nginx config test failed"
echo ""

# 启动 pm2 进程管理器
echo "--- Starting backend services with PM2..."
cd /app
pm2 start /app/ecosystem.config.js 2>&1
echo ""
echo "PM2 processes:"
pm2 list 2>&1 || true
echo ""

# 等待服务启动并检查端口
echo "--- Waiting for services to start..."
ready_count=0
max_wait=30

for i in $(seq 1 $max_wait); do
    sleep 2
    
    # 计算就绪的服务数量
    ready=0
    if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then ready=$((ready+1)); fi
    if curl -sf http://127.0.0.1:3004/health >/dev/null 2>&1; then ready=$((ready+1)); fi
    if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then ready=$((ready+1)); fi
    
    echo "  [$i] Services ready: $ready/3 (api-gateway:3000, auth-service:3004, cloud-service:3001)"
    
    if [ $ready -ge 1 ]; then
        # 至少 api-gateway 启动了
        break
    fi
    
    # 如果等待了 10 次还没有任何服务启动，打印 pm2 日志
    if [ $i -eq 15 ]; then
        echo ""
        echo "  WARNING: No services responding yet! PM2 status:"
        pm2 status 2>&1 || true
        echo ""
        echo "  PM2 logs:"
        pm2 logs --nostream --lines 30 --raw 2>&1 || true
        echo ""
        echo "  Process list:"
        ps aux | grep -E "node|pm2" | head -20
        echo ""
    fi
done

echo ""
echo "--- Final service status ---"
for port in 3000 3001 3002 3003 3004 3005; do
    resp=$(curl -s http://127.0.0.1:$port/health 2>/dev/null)
    if [ -n "$resp" ]; then
        echo "  Port $port: ${resp:0:80}"
    else
        echo "  Port $port: NOT RESPONDING"
    fi
done

echo ""
echo "--- Active network listeners ---"
netstat -tlnp 2>/dev/null || ss -tlnp 2>/dev/null || echo "netstat/ss not available"

echo ""
echo "--- Starting nginx on port $NGINX_PORT ---"
echo "============================================"
nginx -g 'daemon off;'