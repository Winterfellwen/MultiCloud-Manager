#!/bin/sh

echo "============================================"
echo "  CloudOps Platform - Starting Services"
echo "============================================"
echo ""

# 环境变量信息（仅显示非敏感前缀）
echo "--- Environment ---"
echo "PORT: $PORT"
echo "DATABASE_URL: ${DATABASE_URL:0:40}..."
echo "REDIS_URL: ${REDIS_URL:0:40}..."
echo ""

NGINX_PORT=${PORT:-80}
echo "NGINX_PORT: $NGINX_PORT"
echo ""

# 更新 nginx 配置
echo "--- Configuring nginx..."
sed -i "s/__NGINX_PORT__/$NGINX_PORT/g" /etc/nginx/nginx.conf
nginx -t 2>&1 || echo "WARNING: nginx config test failed"
echo ""

# 启动 pm2（所有服务并行启动）
echo "--- Starting backend services with PM2..."
cd /app
pm2 start /app/ecosystem.config.js --wait-ready --listen-timeout 10000 2>&1
echo ""

# 等待服务就绪（快速检查，不阻塞）
echo "--- Waiting for services to start..."
max_wait=20
for i in $(seq 1 $max_wait); do
    # 检查关键服务
    if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1 && \
       curl -sf http://127.0.0.1:3004/health >/dev/null 2>&1; then
        echo "✓ Core services ready (api-gateway, auth-service)"
        break
    fi
    sleep 1
done

echo ""
echo "--- PM2 status ---"
pm2 list 2>&1 || true
echo ""

echo "--- Service health ---"
for port in 3000 3001 3002 3003 3004 3005; do
    resp=$(curl -s http://127.0.0.1:$port/health 2>/dev/null)
    if [ -n "$resp" ]; then
        echo "  Port $port: ✓"
    else
        echo "  Port $port: ✗"
    fi
done

echo ""

# Demo 数据自动初始化（仅本地开发环境，DEMO_AUTO_SEED=true 时执行）
if [ "$DEMO_AUTO_SEED" = "true" ] && [ -f /app/scripts/seed-demo.js ]; then
    echo "--- Seeding demo data ---"
    if [ -n "$DATABASE_URL" ]; then
        node /app/scripts/seed-demo.js 2>&1 || echo "WARNING: demo seed failed"
    else
        echo "WARNING: DATABASE_URL not set, skip demo seed"
    fi
fi

echo ""
echo "--- Starting nginx on port $NGINX_PORT ---"
echo "============================================"
nginx -g 'daemon off;'