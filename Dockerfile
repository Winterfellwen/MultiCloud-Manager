FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq curl python3 python3-pip

# Install opencode CLI (direct binary download — install script fails on Render due to API limits)
RUN curl -sL -o /tmp/opencode.tar.gz "https://github.com/anomalyco/opencode/releases/download/v1.15.8/opencode-linux-x64.tar.gz" && \
    tar xzf /tmp/opencode.tar.gz -C /usr/local/bin && \
    chmod +x /usr/local/bin/opencode && \
    opencode --version

# Install Azure CLI
RUN pip3 install azure-cli

WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN go build -o app .

COPY web/ ../web/
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8099 4096

CMD ["/start.sh"]
