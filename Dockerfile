FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq curl python3 python3-pip

# Install opencode CLI (direct binary download — install script fails on Render due to API limits)
# Install opencode CLI via npm
RUN apt-get update -qq && apt-get install -y -qq nodejs npm && \
    npm install -g opencode-ai@1.15.8 && \
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
