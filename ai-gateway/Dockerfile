FROM node:22-alpine

WORKDIR /app

# 使用阿里云 Alpine 镜像源加速 apk 安装
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++ sqlite-dev && \
    npm install -g pnpm --registry=https://registry.npmmirror.com

# 配置 pnpm/npm 镜像源 + node-gyp headers 镜像（better-sqlite3 编译需要）
RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY ai-gateway/package.json ai-gateway/tsconfig.json ./ai-gateway/

RUN pnpm install --filter=@cloudops/ai-gateway --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY ai-gateway/ ./ai-gateway/

RUN cd ai-gateway && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

RUN mkdir -p /app/ai-gateway/data

WORKDIR /app/ai-gateway

ENV NODE_ENV=production
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

EXPOSE 3005
CMD ["node", "dist/index.js"]
