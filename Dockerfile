FROM golang:1.21-bookworm

# Install minimal dependencies and Azure CLI
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3-venv curl && \
    python3 -m venv /opt/az && \
    /opt/az/bin/pip install --no-cache-dir azure-cli && \
    ln -s /opt/az/bin/az /usr/local/bin/az && \
    apt-get remove -y python3-pip && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /root/.cache

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o app .

EXPOSE 8080
CMD ["./app"]
