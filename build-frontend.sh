#!/bin/bash
# 快速构建前端并更新Docker
# 用法: ./build-frontend.sh

set -e

echo "📦 构建前端..."
cd web-console && npm run build && cd ..

echo "🐳 构建Docker镜像..."
docker compose build app

echo "🚀 重启服务..."
docker compose up -d --force-recreate app

echo "✅ 完成！"
