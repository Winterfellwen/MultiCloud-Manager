FROM golang:1.22-alpine

RUN apk add --no-cache curl bash python3 py3-pip

RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"

RUN pip3 install azure-cli

WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN go build -o app .

COPY web/ ../web/

EXPOSE 8099 4096

CMD ["sh", "-c", "opencode serve --port 4096 --hostname 0.0.0.0 & ./app"]
