FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY auth-service/package.json auth-service/tsconfig.json ./auth-service/
COPY auth-service/migrations ./auth-service/migrations/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/auth-service --dangerously-allow-all-builds

COPY shared/ ./shared/
COPY auth-service/ ./auth-service/

RUN cd shared && pnpm run build
RUN cd auth-service && pnpm run build

RUN cp -r auth-service/migrations auth-service/dist/migrations

WORKDIR /app/auth-service

CMD ["node", "dist/index.js"]