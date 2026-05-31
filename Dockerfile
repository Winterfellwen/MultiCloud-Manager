FROM golang:1.21-bookworm

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o app .

EXPOSE 8080

# Install Azure CLI at startup if not cached
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

CMD ["sh", "-c", "if [ ! -f /opt/az/bin/az ]; then python3 -m venv /opt/az && /opt/az/bin/pip install --no-cache-dir azure-cli && ln -s /opt/az/bin/az /usr/local/bin/az; fi && ./app"]
