FROM golang:1.21-bookworm

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o app .

EXPOSE 8080
CMD ["./app"]
