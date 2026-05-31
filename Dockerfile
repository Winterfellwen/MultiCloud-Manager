# Stage 1: Install Azure CLI
FROM python:3.11-slim-bookworm AS az-builder
RUN pip install --no-cache-dir azure-cli && \
    rm -rf /root/.cache /tmp/*

# Stage 2: Build Go app
FROM golang:1.21-bookworm AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o app .

# Stage 3: Final minimal image
FROM debian:bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy Azure CLI from builder
COPY --from=az-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=az-builder /usr/local/bin/az /usr/local/bin/az

# Copy Go binary
COPY --from=go-builder /app/app /app/app

WORKDIR /app
EXPOSE 8080
CMD ["./app"]
