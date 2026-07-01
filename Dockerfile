# 多阶段构建：构建所有后端服务
# 优化：分层缓存 - package.json 优先复制便于缓存 npm install 层
FROM node:22-alpine AS builder

WORKDIR /app

# 国内镜像源加速（apk + npm）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    npm config set registry https://registry.npmmirror.com

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# ========== 优化：分层复制以利用 Docker 缓存 ==========
# 先复制 package.json，利用 Docker 层缓存避免重复 npm install

# shared 包
COPY shared/package.json ./shared/
COPY shared/tsconfig.json ./shared/

# 后端服务 - 先复制 package.json 和 tsconfig.json
COPY auth-service/package.json ./auth-service/
COPY auth-service/tsconfig.json ./auth-service/
COPY api-gateway/package.json ./api-gateway/
COPY api-gateway/tsconfig.json ./api-gateway/
COPY cloud-service/package.json ./cloud-service/
COPY cloud-service/tsconfig.json ./cloud-service/
COPY monitor-service/package.json ./monitor-service/
COPY monitor-service/tsconfig.json ./monitor-service/
COPY ai-agent/package.json ./ai-agent/
COPY ai-agent/tsconfig.json ./ai-agent/
COPY ai-gateway/package.json ./ai-gateway/
COPY ai-gateway/tsconfig.json ./ai-gateway/

# 构建 shared 模块（放在前面因为其他服务依赖它）
COPY shared/src ./shared/src
RUN cd shared && npm install && npm run build

# 为每个服务安装依赖并构建
# 复制各服务源码并构建
COPY auth-service/src ./auth-service/src
COPY auth-service/migrations ./auth-service/migrations
COPY api-gateway/src ./api-gateway/src
# api-gateway 无 migrations
COPY cloud-service/src ./cloud-service/src
COPY cloud-service/migrations ./cloud-service/migrations
COPY monitor-service/src ./monitor-service/src
COPY monitor-service/migrations ./monitor-service/migrations
COPY ai-agent/src ./ai-agent/src
COPY ai-agent/migrations ./ai-agent/migrations
COPY ai-gateway/src ./ai-gateway/src
COPY ai-gateway/migrations ./ai-gateway/migrations

RUN for svc in auth-service api-gateway cloud-service monitor-service ai-agent ai-gateway; do \
      cd /app/$svc && \
      sed 's|"workspace:\*"|"file:../shared"|g' package.json > package.json.tmp && \
      mv package.json.tmp package.json && \
      npm install && \
      npm run build && \
      echo "Built $svc"; \
    done

# 剪枝 devDependencies，保留生产依赖（含已编译的原生模块）
RUN for svc in auth-service api-gateway cloud-service monitor-service ai-agent ai-gateway; do \
      cd /app/$svc && npm prune --omit=dev; \
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

# 国内镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache python3 make g++

# 安装 pnpm
RUN npm install -g pnpm && pnpm config set registry https://registry.npmmirror.com

# 复制 pnpm workspace 根配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 复制 shared + web-console（含 openclaw-ui workspace 成员）
COPY shared ./shared
COPY web-console ./web-console

# 安装整个 workspace 的依赖（包含 devDependencies）
RUN pnpm config set dangerouslyAllowAllBuilds true && \
    pnpm install --config.minimumReleaseAge=0

ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

# 先构建 openclaw-ui（Lit Web Component bundle）
RUN pnpm --filter @cloudops/openclaw-ui build

# 再构建 web-console（会复制 openclaw-ui/dist/cloudops-chat.js 到 dist/）
RUN pnpm --filter @cloudops/web-console build

# 最终镜像
FROM node:22-alpine

WORKDIR /app

# 国内镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装运行时依赖（无需 g++/python，原生模块已在 builder 编译好）
RUN apk add --no-cache nginx supervisor curl && \
    npm install -g pm2

# 复制构建产物 + node_modules（从 builder 直接复制，避免重复编译原生模块）
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/node_modules ./shared/node_modules
COPY --from=builder /app/shared/package.json ./shared/package.json

COPY --from=builder /app/auth-service/dist ./auth-service/dist
COPY --from=builder /app/auth-service/node_modules ./auth-service/node_modules
COPY --from=builder /app/auth-service/package.json ./auth-service/package.json

COPY --from=builder /app/api-gateway/dist ./api-gateway/dist
COPY --from=builder /app/api-gateway/node_modules ./api-gateway/node_modules
COPY --from=builder /app/api-gateway/package.json ./api-gateway/package.json

COPY --from=builder /app/cloud-service/dist ./cloud-service/dist
COPY --from=builder /app/cloud-service/node_modules ./cloud-service/node_modules
COPY --from=builder /app/cloud-service/package.json ./cloud-service/package.json

COPY --from=builder /app/monitor-service/dist ./monitor-service/dist
COPY --from=builder /app/monitor-service/node_modules ./monitor-service/node_modules
COPY --from=builder /app/monitor-service/package.json ./monitor-service/package.json

COPY --from=builder /app/ai-agent/dist ./ai-agent/dist
COPY --from=builder /app/ai-agent/node_modules ./ai-agent/node_modules
COPY --from=builder /app/ai-agent/package.json ./ai-agent/package.json

COPY --from=builder /app/ai-gateway/dist ./ai-gateway/dist
COPY --from=builder /app/ai-gateway/node_modules ./ai-gateway/node_modules
COPY --from=builder /app/ai-gateway/package.json ./ai-gateway/package.json

# migrations
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
COPY nginx.conf /etc/nginx/nginx.conf
RUN rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf 2>/dev/null; \
    mkdir -p /etc/nginx/http.d /etc/nginx/conf.d; \
    find /etc/nginx/http.d /etc/nginx/conf.d -name "*.conf" -delete 2>/dev/null; \
    echo "nginx config prepared"

# 创建沙箱用户和沙箱脚本（用于 shell_execute 安全隔离）
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox && \
    echo '#!/bin/sh' > /usr/local/bin/sandbox-shell.sh && \
    echo '# 剥离所有敏感环境变量' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_SUBSCRIPTION_ID' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset TENCENT_SECRET_ID TENCENT_SECRET_KEY' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset HUAWEI_ACCESS_KEY HUAWEI_SECRET_KEY' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset DATABASE_URL REDIS_URL JWT_SECRET JWT_EXPIRES_IN' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset LLM_API_KEY LLM_BASE_URL LLM_MODEL' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'unset ADMIN_USERNAME ADMIN_PASSWORD' >> /usr/local/bin/sandbox-shell.sh && \
    echo '' >> /usr/local/bin/sandbox-shell.sh && \
    echo '# 拦截凭证提取命令' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'BLOCKED="env|printenv|^set$|^export |cat.*/proc/.*/environ|cat.*/etc/shadow|curl.*169.254.169.254|wget.*169.254.169.254"' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'if echo "$*" | grep -qE "$BLOCKED"; then' >> /usr/local/bin/sandbox-shell.sh && \
    echo '  echo "Error: 此命令被安全策略禁止（禁止读取环境变量或凭证）" >&2' >> /usr/local/bin/sandbox-shell.sh && \
    echo '  exit 1' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'fi' >> /usr/local/bin/sandbox-shell.sh && \
    echo '' >> /usr/local/bin/sandbox-shell.sh && \
    echo 'exec /bin/sh -c "$*"' >> /usr/local/bin/sandbox-shell.sh && \
    chmod +x /usr/local/bin/sandbox-shell.sh

# 复制启动脚本
COPY start.sh ./
RUN chmod +x start.sh

# 启动脚本
CMD ["./start.sh"]
