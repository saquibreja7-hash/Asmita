# Asmita crawler: one-shot job image (Cloud Run job, asia-south1).
#
# Build from the REPOSITORY ROOT, because the bundle includes the read-only
# PDQ module from asmita/src/lib/pdq/pdq.ts:
#   docker build -f crawler/Dockerfile -t asmita-crawler .
# BuildKit then uses crawler/Dockerfile.dockerignore (not the repo root's).
#
# Runs as non-root on distroless, built for `docker run --read-only`: the
# process never writes to disk. TMPDIR points at a path that does not exist
# so any temp-file attempt (for example libvips) fails instead of writing.

FROM node:22-bookworm-slim AS build
WORKDIR /src/crawler
COPY crawler/package.json crawler/package-lock.json ./
RUN npm ci
COPY crawler/ ./
COPY asmita/src/lib/pdq/pdq.ts /src/asmita/src/lib/pdq/pdq.ts
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY crawler/package.json crawler/package-lock.json ./
# Runtime dependencies only. sharp ships prebuilt libvips for linux-x64 glibc.
RUN npm ci --omit=dev && npm cache clean --force

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /src/crawler/dist/main.js ./dist/main.js
# "type": "module" for dist/main.js
COPY crawler/package.json ./package.json
ENV NODE_ENV=production \
    VIPS_DISC_THRESHOLD=2g \
    TMPDIR=/nonexistent-no-temp-files \
    NODE_OPTIONS=--max-old-space-size=1536
USER nonroot
ENTRYPOINT ["/nodejs/bin/node", "dist/main.js"]
CMD ["run"]
