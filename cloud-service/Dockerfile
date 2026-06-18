FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY cloud-service/package.json cloud-service/tsconfig.json cloud-service/drizzle.config.ts ./cloud-service/
COPY cloud-service/migrations ./cloud-service/migrations/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/cloud-service --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY shared/ ./shared/
COPY cloud-service/ ./cloud-service/

RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd cloud-service && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

RUN cp -r cloud-service/migrations cloud-service/dist/migrations

WORKDIR /app/cloud-service

CMD ["node", "dist/index.js"]
