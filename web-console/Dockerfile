FROM node:22-alpine AS builder
WORKDIR /app
# 使用阿里云镜像源加速
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories
RUN npm install -g pnpm --registry=https://registry.npmmirror.com && pnpm config set registry https://registry.npmmirror.com
# 复制 workspace 配置（含 openclaw-ui workspace 成员）
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web-console ./web-console
COPY shared ./shared
RUN pnpm config set dangerouslyAllowAllBuilds true && pnpm install --config.minimumReleaseAge=0
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
# 先构建 openclaw-ui（Lit Web Component bundle）
RUN pnpm --filter @cloudops/openclaw-ui build
# 再构建 web-console（会复制 openclaw-ui/dist/cloudops-chat.js 到 dist/）
RUN pnpm --filter @cloudops/web-console build

FROM nginx:alpine
COPY --from=builder /app/web-console/dist /usr/share/nginx/html
COPY web-console/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
