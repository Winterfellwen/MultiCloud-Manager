# 多阶段构建：构建所有后端服务
FROM node:22-alpine AS builder

# 配置 Alpine 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 配置 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com

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

# 配置 Alpine 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

RUN apk add --no-cache python3 make g++

# 配置 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com

# 复制整个前端目录（包含所有配置文件和源代码）
COPY shared/ ./shared/
COPY web-console/ ./web-console/

# 修复 workspace 依赖，用本地路径代替
RUN sed -i 's|"workspace:\*"|"file:../shared"|g' /app/web-console/package.json && \
    sed -i 's|"workspace:\*"|"file:../shared"|g' /app/web-console/openclaw-ui/package.json

# 构建 shared
RUN cd /app/shared && npm install && npm run build

# 构建 openclaw-ui
RUN cd /app/web-console/openclaw-ui && npm install && npm run build

# 构建 web-console（包含 tailwind.config.js 等所有配置文件）
RUN cd /app/web-console && npm install && npm run build

# 最终镜像
FROM node:22-alpine

# 配置 Alpine 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache nginx supervisor && \
    npm install -g pm2

# 配置 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com

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

# 暴露端口
EXPOSE 80 3000 3001 3002 3003 3004 3005

# 启动脚本
CMD ["./start.sh"]
