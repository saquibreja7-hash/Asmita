# Asmita crawler: one-shot job image (Cloud Run job, asia-south1).
#
# Build from the REPOSITORY ROOT, because the bundle includes the read-only
# PDQ module from asmita/src/lib/pdq/pdq.ts:
#   docker build -f crawler/Dockerfile -t asmita-crawler .
# BuildKit then uses crawler/Dockerfile.dockerignore (not the repo root's).
#
# Runs as the non-root "node" user, built for `docker run --read-only`: the
# process never writes to disk. TMPDIR points at a path that does not exist
# so any temp-file attempt (for example libvips) fails instead of writing.
#
# Crawler v2 WP7 adds headless Chromium for browser-rendered sources
# (render = BROWSER/AUTO). The runtime base is node:22-bookworm-slim
# instead of distroless: Chromium needs its shared-library set, and copying
# dlopen-loaded libraries into distroless without a package manager is not
# maintainable. The browser is installed by playwright-core's own CLI, so
# the revision is pinned by the lockfile. Chromium's throwaway profile and
# shared memory live in /dev/shm: run the container with --shm-size=1g
# (or --tmpfs /dev/shm:size=1g). Nothing else about the runtime posture
# changed: no package manager use at runtime, read-only root filesystem,
# non-root user, unwritable TMPDIR for the main process (the browser worker
# child gets TMPDIR=BROWSER_TMP_DIR=/dev/shm, a tmpfs, set by its parent).

FROM node:22-bookworm-slim AS build
WORKDIR /src/crawler
COPY crawler/package.json crawler/package-lock.json ./
RUN npm ci
COPY crawler/ ./
COPY asmita/src/lib/pdq/pdq.ts /src/asmita/src/lib/pdq/pdq.ts
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers
COPY crawler/package.json crawler/package-lock.json ./
# Runtime dependencies only. sharp ships prebuilt libvips for linux-x64 glibc.
RUN npm ci --omit=dev && npm cache clean --force
# The Chromium build playwright-core drives plus its system libraries, both
# pinned by the lockfile's playwright-core version.
RUN npx playwright-core install --with-deps chromium && rm -rf /var/lib/apt/lists/*

# The runtime IS the deps stage plus dist/: Chromium's system libraries are
# installed by apt into the image filesystem, so the final stage inherits them.
FROM deps
WORKDIR /app
ENV NODE_ENV=production \
    VIPS_DISC_THRESHOLD=2g \
    TMPDIR=/nonexistent-no-temp-files \
    PLAYWRIGHT_BROWSERS_PATH=/app/browsers \
    BROWSER_TMP_DIR=/dev/shm \
    NODE_OPTIONS=--max-old-space-size=1536
# main.js (crawler), decoder-worker.js (isolated decoder child process) and
# browser-worker.js (isolated Chromium child process, WP7)
COPY --from=build /src/crawler/dist/ ./dist/
# "type": "module" for dist/main.js
COPY crawler/package.json ./package.json
USER node
ENTRYPOINT ["node", "dist/main.js"]
CMD ["run"]
