FROM golang:1.22

RUN apt-get update -qq && apt-get install -y -qq curl unzip python3 python3-pip && \
    pip3 install azure-cli

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app
COPY package.json bun.lock ./
RUN bun add opencode-ai@1.15.8

COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o app .

COPY web/ ../web/

EXPOSE 8099 4096

CMD sh -c "opencode serve --port 4096 --hostname 0.0.0.0 & ./app"
