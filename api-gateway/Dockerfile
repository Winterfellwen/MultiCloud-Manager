FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY api-gateway/package.json api-gateway/tsconfig.json ./api-gateway/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/api-gateway --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY shared/ ./shared/
COPY api-gateway/ ./api-gateway/

RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd api-gateway && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

WORKDIR /app/api-gateway

CMD ["node", "dist/index.js"]