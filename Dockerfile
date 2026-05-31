FROM oven/bun:1 AS runtime
RUN apt-get update -qq && apt-get install -y -qq python3 python3-pip golang-go && \
    pip3 install azure-cli

COPY opencode-source/ /opencode-source/
WORKDIR /opencode-source
RUN bun install

WORKDIR /gobuild
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o app .

COPY web/ /web/
EXPOSE 8099 4096

WORKDIR /opencode-source
CMD sh -c "bun run --conditions=browser packages/opencode/src/index.ts & /gobuild/app"
