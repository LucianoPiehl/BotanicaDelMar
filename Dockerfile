FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY admin.css admin.html admin.js api-client.js app.js arrepentimiento.html envios.html index.css index.html legal.html payment-result.html payment-result.js pricing-rules.js store-common.js ./
COPY assets ./assets
COPY data/catalog.js ./data/catalog.js
COPY server ./server

RUN mkdir -p /data \
  && chown -R node:node /app /data

USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV BOTANICA_DB_PATH=/data/database.json

VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/server.js"]
