FROM node:22-alpine

WORKDIR /app

# 使用阿里云 Alpine 镜像源加速 apk 安装
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++ && \
    npm install -g pnpm --registry=https://registry.npmmirror.com

# 配置 pnpm 镜像源 + node-gyp headers 镜像（native 模块编译需要）
RUN pnpm config set registry https://registry.npmmirror.com
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY ai-agent/package.json ai-agent/tsconfig.json ai-agent/drizzle.config.ts ./ai-agent/
COPY ai-agent/migrations ./ai-agent/migrations/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/ai-agent --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY shared/ ./shared/
COPY ai-agent/ ./ai-agent/

RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd ai-agent && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

RUN cp -r ai-agent/migrations ai-agent/dist/migrations

WORKDIR /app/ai-agent

CMD ["node", "dist/index.js"]
