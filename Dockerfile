FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq curl python3 python3-pip

# Install opencode CLI
RUN curl -fsSL https://opencode.ai/install | bash && \
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

CMD sh -c "opencode serve --port 4096 --hostname 0.0.0.0 & ./app"
