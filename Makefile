.PHONY: dev build up down restart logs clean reset

# 开发模式（本地启动所有服务）
dev:
	cd web-console && npm run dev

# 重新构建并重启（保留数据库）
build:
	docker compose -f docker-compose.simple.yml up -d --build

# 仅重启（不重新构建）
up:
	docker compose -f docker-compose.simple.yml up -d

# 停止服务（保留数据库）
down:
	docker compose -f docker-compose.simple.yml down

# 重启所有服务
restart:
	docker compose -f docker-compose.simple.yml restart

# 查看日志
logs:
	docker compose -f docker-compose.simple.yml logs -f

# 查看特定服务日志
logs-%:
	docker compose -f docker-compose.simple.yml logs -f $*

# 查看服务状态
status:
	docker compose -f docker-compose.simple.yml ps
	@echo ""
	@echo "=== PM2 进程 ==="
	docker compose -f docker-compose.simple.yml exec server pm2 ls

# ⚠️ 重置数据库（会丢失所有数据）
reset:
	@echo "⚠️  即将删除所有数据库数据，按 Ctrl+C 取消，3 秒后执行..."
	@sleep 3
	docker compose -f docker-compose.simple.yml down -v
	docker compose -f docker-compose.simple.yml up -d --build
