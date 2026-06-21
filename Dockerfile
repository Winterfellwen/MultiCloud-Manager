# 多阶段构建：构建所有后端服务
FROM node:22-alpine AS builder

WORKDIR /app

# 安装依赖
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++ && \
    npm install -g pnpm@9 --registry=https://registry.npmmirror.com

# 配置 pnpm 镜像源
RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

# 复制所有源代码（一次性复制，避免分层问题）
COPY shared/ ./shared/
COPY auth-service/ ./auth-service/
COPY api-gateway/ ./api-gateway/
COPY cloud-service/ ./cloud-service/
COPY monitor-service/ ./monitor-service/
COPY ai-agent/ ./ai-agent/
COPY ai-gateway/ ./ai-gateway/

# 构建 shared 模块（优先于其他服务）
RUN cd shared && pnpm run build

# 为每个服务创建独立的 node_modules（使用 npm 解决 @cloudops/shared）
RUN for svc in auth-service api-gateway cloud-service monitor-service ai-agent ai-gateway; do \
      cd /app/$svc && \
      sed 's|"workspace:\*"|"file:../shared"|g' package.json > package.json.tmp && \
      mv package.json.tmp package.json && \
      npm install --omit=dev 2>&1 | tail -3 && \
      echo "Installed deps for $svc"; \
    done

# 构建所有服务（使用 tsc 直接编译，跳过 pnpm scripts）
RUN cd auth-service && npx tsc && echo "Built auth-service"
RUN cd api-gateway && npx tsc && echo "Built api-gateway"
RUN cd cloud-service && npx tsc && echo "Built cloud-service"
RUN cd monitor-service && npx tsc && echo "Built monitor-service"
RUN cd ai-agent && npx tsc && echo "Built ai-agent"
RUN cd ai-gateway && npx tsc && echo "Built ai-gateway"

# 复制数据库迁移文件
RUN cp -r auth-service/migrations auth-service/dist/migrations && \
    cp -r ai-gateway/migrations ai-gateway/dist/migrations && \
    cp -r ai-agent/migrations ai-agent/dist/migrations && \
    cp -r cloud-service/migrations cloud-service/dist/migrations && \
    cp -r monitor-service/migrations monitor-service/dist/migrations

# 最终阶段：构建前端和nginx
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# 安装前端依赖
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++ && \
    npm install -g pnpm@9 --registry=https://registry.npmmirror.com

RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

# 复制工作区配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY web-console/package.json web-console/tsconfig.json web-console/vite.config.ts ./web-console/
COPY web-console/openclaw-ui/package.json web-console/openclaw-ui/tsconfig.json web-console/openclaw-ui/vite.config.ts ./web-console/openclaw-ui/

# 安装前端依赖（不做 filter，确保 workspace symlinks 正确创建）
RUN pnpm install --config.minimumReleaseAge=0

# 复制前端源代码
COPY shared/ ./shared/
COPY web-console/ ./web-console/

# 构建前端
RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd web-console/openclaw-ui && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd web-console && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

# 最终镜像
FROM node:22-alpine

WORKDIR /app

# 安装运行时依赖
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache nginx supervisor && \
    npm install -g pm2 --registry=https://registry.npmmirror.com

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
COPY nginx.conf /etc/nginx/http.d/default.conf

# 复制 shared 包
COPY shared/package.json ./shared/

# 复制各服务 package.json
COPY auth-service/package.json ./auth-service/
COPY api-gateway/package.json ./api-gateway/
COPY cloud-service/package.json ./cloud-service/
COPY monitor-service/package.json ./monitor-service/
COPY ai-agent/package.json ./ai-agent/
COPY ai-gateway/package.json ./ai-gateway/
COPY web-console/package.json ./web-console/

# 将 workspace:* 替换为 file:../shared 并用 npm 安装运行时依赖
RUN for svc in auth-service api-gateway cloud-service monitor-service ai-agent ai-gateway; do \
      sed -i 's|"workspace:\*"|"file:../shared"|g' "$svc/package.json" && \
      cd "$svc" && npm install --omit=dev --ignore-scripts 2>&1 | tail -2 && \
      cd /app && echo "Installed runtime deps for $svc"; \
    done

# 复制启动脚本
COPY start.sh ./
RUN chmod +x start.sh

# 暴露端口
EXPOSE 80 3000 3001 3002 3003 3004 3005

# 启动脚本
CMD ["./start.sh"]