# ============================================================
# CloudOps AI Platform - Makefile
# ============================================================
# 支持三种部署方式：Docker Compose / Render / Kubernetes
# ============================================================

.PHONY: help compose-up compose-down compose-logs compose-restart compose-admin \
        render-deploy render-clean \
        k8s-apply k8s-delete k8s-logs k8s-admin k8s-port-forward \
        test-health

# 默认目标
.DEFAULT_GOAL := help

# ============================================================
# Help
# ============================================================
help:
	@echo "CloudOps AI Platform - 部署工具"
	@echo ""
	@echo "用法：make [目标] [参数]"
	@echo ""
	@echo "=== Docker Compose（本地/自建服务器 ==="
	@echo "  compose-up          启动所有服务"
	@echo "  compose-down        停止并删除所有服务"
	@echo "  compose-restart     重启应用（保留数据"
	@echo "  compose-logs        查看容器日志"
	@echo "  compose-admin       打印 admin 登录凭据"
	@echo ""
	@echo "=== Render（PaaS ==="
	@echo "  render-deploy      推送代码到 Git → Render 自动部署"
	@echo "  render-clean       提示如何删除 Render 服务"
	@echo ""
	@echo "=== Kubernetes（生产环境 ==="
	@echo "  k8s-apply          部署到 K8s 集群"
	@echo "  k8s-delete         从 K8s 集群删除部署"
	@echo "  k8s-logs          查看 pod 日志"
	@echo "  k8s-admin         打印 admin 登录凭据"
	@echo "  k8s-port-forward    本地端口转发到服务（测试用"
	@echo ""
	@echo "=== 通用测试 ==="
	@echo "  test-health         测试健康检查"

# ============================================================
# Docker Compose
# ============================================================
compose-up:
	@echo "→ 启动 Docker Compose..."
	docker compose up -d --build
	@echo "✅ 部署完成！等待服务启动..."
	@sleep 10
	@echo ""
	@echo "访问地址：http://localhost:$(APP_PORT)"
	@echo "登录凭据："
	@echo "  用户名: admin"
	@echo "  密码: 首次随机生成，见 docker compose logs app"
	@echo ""

compose-down:
	@echo "→ 停止 Docker Compose..."
	docker compose down
	@echo "✅ 服务已停止"

compose-restart:
	@echo "→ 重启应用..."
	docker compose restart app
	@echo "✅ 应用已重启"

compose-logs:
	docker compose logs -f app

compose-admin:
	@echo "→ 在日志中查找 admin 密码（首次启动时打印）..."
	@docker compose logs app 2>&1 | grep -A 5 "admin\|密码\|ADMIN\|🔑\|========================================" || echo "未找到 admin 日志，可能密码已被滚动"

# ============================================================
# Render
# ============================================================
render-deploy:
	@echo "→ 推送代码到 Git，触发 Render 自动部署..."
	git add -A
	git commit -m "chore(deploy): 更新部署配置 $(shell date +%Y-%m-%dT%H:%M:%S)" || true
	git push origin HEAD
	@echo "✅ 已推送。请在 Render 面板查看部署进度"
	@echo "   访问：https://dashboard.render.com/"

render-clean:
	@echo "在 Render 面板删除服务：Settings → Delete Service"
	@echo "   访问：https://dashboard.render.com/"

# ============================================================
# Kubernetes
# ============================================================
k8s-apply:
	@echo "→ 部署到 K8s..."
	kubectl apply -f k8s/00-namespace.yaml
	kubectl apply -f k8s/01-configmap.yaml
	kubectl apply -f k8s/02-secret.yaml
	kubectl apply -f k8s/03-postgres.yaml
	kubectl apply -f k8s/04-redis.yaml
	kubectl apply -f k8s/05-app.yaml
	kubectl apply -f k8s/06-ingress.yaml
	@echo "✅ K8s 部署完成！"
	@echo ""
	@echo "查看状态："
	@echo "  kubectl get pods -n cloudops"
	@echo ""
	@echo "Ingress 域名: cloudops.example.com（请修改 06-ingress.yaml 中 host"

k8s-delete:
	@echo "→ 从 K8s 删除部署..."
	kubectl delete -f k8s/06-ingress.yaml 2>/dev/null || true
	kubectl delete -f k8s/05-app.yaml 2>/dev/null || true
	kubectl delete -f k8s/04-redis.yaml 2>/dev/null || true
	kubectl delete -f k8s/03-postgres.yaml 2>/dev/null || true
	kubectl delete -f k8s/02-secret.yaml 2>/dev/null || true
	kubectl delete -f k8s/01-configmap.yaml 2>/dev/null || true
	@echo "✅ 已删除（数据保留在 PVC 中，如需删除请手动执行 kubectl delete pvc -n cloudops --all"

k8s-logs:
	@echo "→ 查看应用日志（Ctrl+C 退出）..."
	kubectl logs -f -n cloudops deployment/cloudops-app

k8s-admin:
	@echo "→ 在应用日志中查找 admin 登录凭据..."
	kubectl logs -n cloudops deployment/cloudops-app 2>&1 | tail -100 | grep -A 5 "admin\|密码\|ADMIN\|🔑\|========================================" || echo "未找到 admin 日志，可能密码已被滚动"

k8s-port-forward:
	@echo "→ 本地端口转发（Ctrl+C 退出）..."
	kubectl port-forward -n cloudops service/cloudops-app 8080:80

# ============================================================
# 测试
# ============================================================
test-health:
	@echo "→ 测试健康检查..."
	@echo ""
	@echo "GET http://localhost:$(APP_PORT)/health"
	@curl -s http://localhost:$(APP_PORT)/health || echo "⚠️ 无法连接到服务"
