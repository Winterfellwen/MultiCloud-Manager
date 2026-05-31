FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq unzip python3 python3-pip && \
    pip3 install azure-cli

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install opencode
COPY package.json bun.lock ./
RUN bun install

WORKDIR /app

# Build Go
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o app .

# Static files
COPY web/ ../web/

EXPOSE 8099 4096

CMD sh -c "bun run opencode serve --port 4096 --hostname 0.0.0.0 & ./app"