FROM node:24.3.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps apps
COPY packages packages
COPY tsconfig.json ./
RUN npm run build

FROM node:24.3.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /home/runner/.codex /data && chown -R node:node /home/runner /data
COPY --from=build /app /app
COPY scripts scripts
USER node
ENV NODE_ENV=production
CMD ["node","--import","tsx","apps/server/src/api.ts"]
