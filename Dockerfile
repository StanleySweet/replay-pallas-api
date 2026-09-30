# Multi-stage: native modules are prebuilt per-platform, so compile in a builder
# that matches the runtime image and copy the compiled tree wholesale.
FROM docker.io/library/node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 / sqlite3 / snappy all resolve published arm64+x64 prebuilds
# against the runtime's glibc, so no toolchain is required here.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json


FROM docker.io/library/node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# src/ is required at RUNTIME, not just for the build:
#   index.ts runs migrations from 'src/migrations'
#   Settings.ts / Weights.ts read 'src/local-ratings/types/options.json'
# Both are resolved relative to CWD, so the image must ship src/ beside dist/.
COPY src ./src

# The sqlite database and the local-ratings JSON caches live here. When run
# without a volume, podman creates this directory as the mount point anyway;
# this keeps `node dist/index.js` working standalone too.
RUN mkdir -p dist/cache

EXPOSE 8080

# /metrics needs Basic auth and /health/vacuum needs a JWT, so neither can be
# used as a probe. /swagger/ui is on the auth-hook allowlist, which makes it the
# cheapest endpoint that actually proves the HTTP server is serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/swagger/ui').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "./dist/index.js"]
