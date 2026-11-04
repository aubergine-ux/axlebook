# syntax=docker/dockerfile:1.7
# Multi-stage build: full toolchain for building, a slim runtime with only
# production dependencies, the bundled server, and the static web app.

ARG NODE_VERSION=24

# ── 1. Install all dependencies (dev included) ─────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# Toolchain for native modules (better-sqlite3) when no prebuilt binary matches.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# ── 2. Build web app + server bundle ──────────────────────────────────────────
FROM deps AS build
COPY . .
ARG AXLEBOOK_VERSION=dev
ENV AXLEBOOK_VERSION=${AXLEBOOK_VERSION}
RUN npm run build

# ── 3. Production dependencies for the server only ──────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund --workspace=@axlebook/server \
 && npm cache clean --force \
 # better-sqlite3 ships prebuilt binaries for every platform plus SQLite sources;
 # keep only the binary for this image's platform (musl + current arch).
 && cd node_modules/better-sqlite3 \
 && keep="linuxmusl-$(node -p process.arch).node" \
 && test -f "prebuilds/$keep" \
 && find prebuilds -type f ! -name "$keep" -delete \
 && rm -rf deps src build

# ── 4. Runtime ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
ARG AXLEBOOK_VERSION=dev
LABEL org.opencontainers.image.title="Axlebook" \
      org.opencontainers.image.description="Self-hosted vehicle maintenance logbook" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${AXLEBOOK_VERSION}"
RUN apk add --no-cache tini \
 # npm/corepack are not needed at runtime; removing them trims attack surface
 # (not size: they live in the base layer).
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    AXLEBOOK_VERSION=${AXLEBOOK_VERSION}
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "server/server.js"]
