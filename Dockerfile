FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq curl unzip python3 python3-pip && \
    pip3 install azure-cli

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Copy opencode source and install deps
COPY opencode-source/ /opencode-source/
WORKDIR /opencode-source
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Build Go
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o app .

# Static files
COPY web/ ../web/

EXPOSE 8099 4096

WORKDIR /opencode-source
CMD sh -c "bun run --conditions=browser packages/opencode/src/index.ts & /app/app"
