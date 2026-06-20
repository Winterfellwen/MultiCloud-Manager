# 多阶段构建：构建所有后端服务
FROM node:22-alpine AS builder

WORKDIR /app

# 安装依赖
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++ && \
    npm install -g pnpm --registry=https://registry.npmmirror.com

# 配置 pnpm 镜像源
RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

# 复制工作区配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 复制所有服务的 package.json
COPY shared/package.json shared/tsconfig.json ./shared/
COPY auth-service/package.json auth-service/tsconfig.json ./auth-service/
COPY api-gateway/package.json api-gateway/tsconfig.json ./api-gateway/
COPY cloud-service/package.json cloud-service/tsconfig.json ./cloud-service/
COPY monitor-service/package.json monitor-service/tsconfig.json ./monitor-service/
COPY ai-agent/package.json ai-agent/tsconfig.json ./ai-agent/
COPY ai-gateway/package.json ai-gateway/tsconfig.json ./ai-gateway/

# 安装所有依赖
RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/auth-service --filter=@cloudops/api-gateway --filter=@cloudops/cloud-service --filter=@cloudops/monitor-service --filter=@cloudops/ai-agent --filter=@cloudops/ai-gateway --dangerously-allow-all-builds --config.minimumReleaseAge=0

# 复制所有源代码
COPY shared/ ./shared/
COPY auth-service/ ./auth-service/
COPY api-gateway/ ./api-gateway/
COPY cloud-service/ ./cloud-service/
COPY monitor-service/ ./monitor-service/
COPY ai-agent/ ./ai-agent/
COPY ai-gateway/ ./ai-gateway/

# 构建所有服务
RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd auth-service && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd api-gateway && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd cloud-service && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd monitor-service && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd ai-agent && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd ai-gateway && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

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
    npm install -g pnpm --registry=https://registry.npmmirror.com

RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

# 复制工作区配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY web-console/package.json web-console/tsconfig.json web-console/vite.config.ts ./web-console/

# 安装前端依赖
RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/web-console --dangerously-allow-all-builds --config.minimumReleaseAge=0

# 复制前端源代码
COPY shared/ ./shared/
COPY web-console/ ./web-console/

# 构建前端
RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd web-console && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

# 最终镜像
FROM node:22-alpine

WORKDIR /app

# 安装运行时依赖
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache nginx supervisor && \
    npm install -g pm2 pnpm --registry=https://registry.npmmirror.com

# 配置 pnpm
RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

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

# 复制 package.json 文件（用于运行时依赖）
COPY shared/package.json ./shared/
COPY auth-service/package.json ./auth-service/
COPY api-gateway/package.json ./api-gateway/
COPY cloud-service/package.json ./cloud-service/
COPY monitor-service/package.json ./monitor-service/
COPY ai-agent/package.json ./ai-agent/
COPY ai-gateway/package.json ./ai-gateway/
COPY web-console/package.json ./web-console/

# 复制工作区配置
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./

# 安装运行时依赖（只安装生产依赖）
RUN cd shared && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0
RUN cd auth-service && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0
RUN cd api-gateway && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0
RUN cd cloud-service && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0
RUN cd monitor-service && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0
RUN cd ai-agent && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0
RUN cd ai-gateway && pnpm install --prod --dangerously-allow-all-builds --config.minimumReleaseAge=0

# 复制启动脚本
COPY start.sh ./
RUN chmod +x start.sh

# 暴露端口
EXPOSE 80 3000 3001 3002 3003 3004 3005

# 启动脚本
CMD ["./start.sh"]