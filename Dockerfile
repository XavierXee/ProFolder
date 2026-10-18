# Single-image build of the web app: Express API + built React frontend served from the same
# origin by `node dist/src/api/server.js` (see the static-serving block in src/api/server.ts).
# Electron is not part of this image — the desktop build stays on electron-builder.

ARG NODE_VERSION=24

# ---- build: full dev install, compile backend + frontend --------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
# Toolchain in case better-sqlite3 has no prebuilt binary for this platform/Node ABI.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# Dev deps include electron/playwright; their binaries are never used in the image.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
 && npm prune --omit=dev

# ---- runtime: production deps + compiled output only ------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5175 \
    MUSIC_ROOT=/music \
    DB_PATH=/data/library.db
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Created here so a fresh named volume mounted at /data inherits node ownership.
RUN mkdir -p /data /music && chown node:node /data /music
USER node
EXPOSE 5175
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/api/server.js"]
