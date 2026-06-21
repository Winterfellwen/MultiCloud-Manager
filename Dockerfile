# 多阶段构建：构建所有后端服务
FROM node:22-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制所有源代码
COPY shared/ ./shared/
COPY auth-service/ ./auth-service/
COPY api-gateway/ ./api-gateway/
COPY cloud-service/ ./cloud-service/
COPY monitor-service/ ./monitor-service/
COPY ai-agent/ ./ai-agent/
COPY ai-gateway/ ./ai-gateway/

# 构建 shared 模块
RUN cd shared && npm install && npm run build && echo "Built shared"

# 为每个服务安装依赖并构建
# 注意：先安装 shared，再安装其他依赖，确保类型定义可用
RUN for svc in auth-service api-gateway cloud-service monitor-service ai-agent ai-gateway; do \
      cd /app/$svc && \
      sed 's|"workspace:\*"|"file:../shared"|g' package.json > package.json.tmp && \
      mv package.json.tmp package.json && \
      npm install && \
      npm run build && \
      echo "Built $svc"; \
    done

# 复制数据库迁移文件
RUN cp -r auth-service/migrations auth-service/dist/migrations && \
    cp -r ai-gateway/migrations ai-gateway/dist/migrations && \
    cp -r ai-agent/migrations ai-agent/dist/migrations && \
    cp -r cloud-service/migrations cloud-service/dist/migrations && \
    cp -r monitor-service/migrations monitor-service/dist/migrations

# 构建前端
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# 安装 pnpm
RUN apk add --no-cache python3 make g++ && \
    npm install -g pnpm@9

# 先复制所有 package.json 文件（确保 workspace 结构正确）
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 创建所有需要的目录结构
RUN mkdir -p shared web-console web-console/openclaw-ui

# 复制各子项目的 package.json 和 tsconfig.json
COPY shared/package.json shared/tsconfig.json ./shared/
COPY web-console/package.json ./web-console/package.json
COPY web-console/tsconfig.json ./web-console/tsconfig.json
COPY web-console/vite.config.ts ./web-console/vite.config.ts
COPY web-console/tsconfig.node.json ./web-console/tsconfig.node.json
COPY web-console/postcss.config.js ./web-console/postcss.config.js
COPY web-console/index.html ./web-console/index.html
COPY web-console/openclaw-ui/package.json ./web-console/openclaw-ui/package.json
COPY web-console/openclaw-ui/tsconfig.json ./web-console/openclaw-ui/tsconfig.json
COPY web-console/openclaw-ui/vite.config.ts ./web-console/openclaw-ui/vite.config.ts

# 安装依赖（使用正确的 workspace 配置）
RUN pnpm install --config.minimumReleaseAge=0 --ignore-scripts

# 复制前端源代码
COPY shared/src ./shared/src
COPY web-console/src ./web-console/src
COPY web-console/openclaw-ui/src ./web-console/openclaw-ui/src

# public 目录可选（如果不存在则跳过）
RUN if [ -d "/app/web-console/public" ]; then echo "public exists"; else mkdir -p /app/web-console/public; fi

# 构建 shared
RUN cd /app/shared && npm run build

# 构建 openclaw-ui
RUN cd /app/web-console/openclaw-ui && npm run build

# 构建 web-console
RUN cd /app/web-console && npm run build

# 最终镜像
FROM node:22-alpine

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache nginx supervisor && \
    npm install -g pm2

# 复制构建产物
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/auth-service/dist ./auth-service/dist
COPY --from=builder /app/api-gateway/dist ./api-gateway/dist
COPY --from=builder /app/cloud-service/dist ./cloud-service/dist
COPY --from=builder /app/monitor-service/dist ./monitor-service/dist
COPY --from=builder /app/ai-agent/dist ./ai-agent/dist
COPY --from=builder /app/ai-gateway/dist ./ai-gateway/dist
COPY --from=builder /app/auth-service/dist/migrations ./auth-service/migrations
COPY --from=builder /app/ai-gateway/dist/migrations ./ai-gateway/migrations
COPY --from=builder /app/ai-agent/dist/migrations ./ai-agent/migrations
COPY --from=builder /app/cloud-service/dist/migrations ./cloud-service/migrations
COPY --from=builder /app/monitor-service/dist/migrations ./monitor-service/migrations

# 复制前端构建产物
COPY --from=frontend-builder /app/web-console/dist ./web-console/dist
RUN mkdir -p /usr/share/nginx/html && cp -r ./web-console/dist/* /usr/share/nginx/html/

# 复制配置文件
COPY ecosystem.config.js ./
# 复制自定义nginx配置（完全替换默认配置，包含http块和server块）
COPY nginx.conf /etc/nginx/nginx.conf
# 清理所有可能包含默认server块的配置文件
RUN rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf 2>/dev/null; \
    mkdir -p /etc/nginx/http.d /etc/nginx/conf.d; \
    # 清空http.d和conf.d目录下所有.conf文件，避免默认配置与我们的配置冲突
    find /etc/nginx/http.d /etc/nginx/conf.d -name "*.conf" -delete 2>/dev/null; \
    echo "nginx config prepared"

# 复制 shared 包和各服务 package.json
COPY shared/package.json ./shared/
COPY auth-service/package.json ./auth-service/
COPY api-gateway/package.json ./api-gateway/
COPY cloud-service/package.json ./cloud-service/
COPY monitor-service/package.json ./monitor-service/
COPY ai-agent/package.json ./ai-agent/
COPY ai-gateway/package.json ./ai-gateway/

# 安装运行时依赖（包括 bcrypt 等原生模块需要构建工具）
RUN apk add --no-cache python3 make g++ curl && \
    for svc in auth-service api-gateway cloud-service monitor-service ai-agent ai-gateway; do \
      sed -i 's|"workspace:\*"|"file:../shared"|g' "$svc/package.json" && \
      cd "$svc" && npm install --omit=dev && \
      cd /app && echo "Installed runtime deps for $svc"; \
    done

# 复制启动脚本
COPY start.sh ./
RUN chmod +x start.sh

# 暴露端口
EXPOSE 80 3000 3001 3002 3003 3004 3005

# 启动脚本
CMD ["./start.sh"]
