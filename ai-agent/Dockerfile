FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

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
