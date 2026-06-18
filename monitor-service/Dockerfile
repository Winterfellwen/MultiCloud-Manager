FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY monitor-service/package.json monitor-service/tsconfig.json monitor-service/drizzle.config.ts ./monitor-service/
COPY monitor-service/migrations ./monitor-service/migrations/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/monitor-service --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY shared/ ./shared/
COPY monitor-service/ ./monitor-service/

RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd monitor-service && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

RUN cp -r monitor-service/migrations monitor-service/dist/migrations

WORKDIR /app/monitor-service

CMD ["node", "dist/index.js"]
