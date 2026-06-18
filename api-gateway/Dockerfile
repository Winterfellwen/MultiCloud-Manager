FROM node:22-alpine

WORKDIR /app

COPY shared/package.json shared/tsconfig.json ./shared/
COPY api-gateway/package.json api-gateway/tsconfig.json ./api-gateway/

RUN cd shared && npm install
RUN cd api-gateway && npm install

COPY shared/ ./shared/
COPY api-gateway/ ./api-gateway/

RUN cd shared && npm run build
RUN cd api-gateway && npm run build

WORKDIR /app/api-gateway

CMD ["node", "dist/index.js"]