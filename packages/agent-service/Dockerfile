FROM oven/bun:1 AS builder
WORKDIR /src
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
COPY --from=builder /src/dist ./dist
COPY --from=builder /src/node_modules ./node_modules
COPY --from=builder /src/package.json ./
EXPOSE 3001
ENV PORT=3001
CMD ["bun", "dist/index.js"]