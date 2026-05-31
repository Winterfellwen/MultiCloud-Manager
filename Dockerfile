FROM golang:1.21-bookworm

# Pre-install Azure CLI using venv to avoid PEP 668
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3-venv python3-pip && \
    python3 -m venv /opt/az-cli-env && \
    /opt/az-cli-env/bin/pip install --no-cache-dir azure-cli && \
    ln -s /opt/az-cli-env/bin/az /usr/local/bin/az && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy go mod files first for layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o app .

EXPOSE 8080
CMD ["./app"]
