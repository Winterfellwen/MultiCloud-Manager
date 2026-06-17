# Multi-stage build for Go + static web assets
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o bin/multicloud main.go

# Production stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS requests to cloud APIs
RUN apk add --no-cache ca-certificates

# Create non-root user
RUN adduser -D -u 1000 appuser

# Copy binary and web assets
COPY --from=builder /app/bin/multicloud /app/multicloud
COPY --from=builder /app/web /app/web
COPY --from=builder /app/skills /app/skills

# Create data directory
RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8099

ENV ENVIRONMENT=production
ENV PORT=8099
ENV DB_PATH=/app/data/multicloud.db
ENV SKILLS_DIR=/app/skills

VOLUME ["/app/data"]

ENTRYPOINT ["/app/multicloud"]
