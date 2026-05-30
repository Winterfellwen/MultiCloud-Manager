FROM golang:1.22-alpine

RUN apk add --no-cache curl bash python3 py3-pip

# Install opencode CLI
RUN curl -fsSL https://opencode.ai/install | bash && \
    ls -la /root/.opencode/bin/opencode && \
    /root/.opencode/bin/opencode --version
ENV PATH="/root/.opencode/bin:${PATH}"

# Install Azure CLI
RUN pip3 install azure-cli

WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN go build -o app .

COPY web/ ../web/

EXPOSE 8099 4096

# Start both opencode and Go API
CMD sh -c "echo 'Starting opencode...' && opencode serve --port 4096 --hostname 0.0.0.0 & sleep 3 && echo 'Starting Go API...' && ./app"
