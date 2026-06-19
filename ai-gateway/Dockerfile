FROM node:22-alpine

WORKDIR /app

# better-sqlite3 编译需要 sqlite-dev
RUN apk add --no-cache python3 make g++ sqlite-dev && npm install -g pnpm

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
