FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY web-console ./web-console
COPY shared ./shared
RUN pnpm config set dangerouslyAllowAllBuilds true && pnpm install
RUN pnpm --filter @cloudops/web-console build

FROM nginx:alpine
COPY --from=builder /app/web-console/dist /usr/share/nginx/html
COPY web-console/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
