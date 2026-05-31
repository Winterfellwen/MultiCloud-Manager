FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq curl python3 python3-pip && \
    pip3 install azure-cli

# Download opencode binary directly
RUN curl -sL -o /tmp/oc.tar.gz https://github.com/anomalyco/opencode/releases/download/v1.15.8/opencode-linux-x64.tar.gz && \
    tar xzf /tmp/oc.tar.gz -C /tmp && \
    find /tmp -name opencode -type f -exec mv {} /usr/local/bin/opencode \; && \
    chmod +x /usr/local/bin/opencode && \
    /usr/local/bin/opencode --version

WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o app .

COPY web/ ../web/

EXPOSE 8099 4096

CMD sh -c "/usr/local/bin/opencode serve --port 4096 --hostname 0.0.0.0 & ./app"
