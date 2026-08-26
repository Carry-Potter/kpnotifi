# Produkcijska slika: build frontenda + Node server (TS se izvršava direktno, Node 24)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY server/ server/
COPY --from=build /app/web/dist web/dist
EXPOSE 3000
CMD ["node", "server/src/index.ts"]
