# Stage 1: build Go binary
FROM golang:1.25-alpine AS go-builder
WORKDIR /src
ENV GOPROXY=https://goproxy.cn,direct \
    GOSUMDB=sum.golang.org
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/multicloud .

# Stage 2: runtime (static HTML frontend, no build step at 3794a4909)
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 1000 app
WORKDIR /app
COPY --from=go-builder /out/multicloud /app/multicloud
COPY web /app/web
USER app
EXPOSE 8099
ENV PORT=8099 \
    GIN_MODE=release \
    ENVIRONMENT=development
ENTRYPOINT ["/app/multicloud"]
