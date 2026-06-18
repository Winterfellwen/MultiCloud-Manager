FROM node:22-alpine

WORKDIR /app

COPY shared/package.json shared/tsconfig.json ./shared/
COPY auth-service/package.json auth-service/tsconfig.json ./auth-service/

RUN cd shared && npm install
RUN cd auth-service && npm install

COPY shared/ ./shared/
COPY auth-service/ ./auth-service/

RUN cd shared && npm run build
RUN cd auth-service && npm run build

WORKDIR /app/auth-service

CMD ["node", "dist/index.js"]