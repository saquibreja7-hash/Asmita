# Asmita crawler: job image (Cloud Run job, asia-south1).
#
# Build from the REPOSITORY ROOT, because the bundle includes read-only
# modules from asmita/src/lib/: the PDQ code (pdq/pdq.ts) and the page-key
# module the crawler's dedup key and the app's frontier digest share
# (crawl-page-key.ts, crawler v3 WP10):
#   docker build -f crawler/Dockerfile -t asmita-crawler .
# BuildKit then uses crawler/Dockerfile.dockerignore (not the repo root's).
#
# The default command is the one-shot `run`; an always-on deployment
# overrides it with `run --loop` (crawler v2 WP6). The container is the
# same either way.
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
COPY asmita/src/lib/crawl-page-key.ts /src/asmita/src/lib/crawl-page-key.ts
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers
COPY crawler/package.json crawler/package-lock.json ./
# Runtime dependencies only. sharp ships prebuilt libvips for linux-x64 glibc;
# onnxruntime-node (the SSCD embedder child, WP28) ships prebuilt binaries too.
RUN npm ci --omit=dev && npm cache clean --force
# The Chromium build playwright-core drives plus its system libraries, both
# pinned by the lockfile's playwright-core version.
RUN npx playwright-core install --with-deps chromium && rm -rf /var/lib/apt/lists/*

# SSCD copy-detection weights (WP28): downloaded at image build time from a
# pinned URL and sha256-checked, never committed to git. Both the code and
# the weights are MIT (Meta Platforms, Inc. and affiliates; verified in
# asmita/docs/adr/008-sscd-second-layer.md, which also records the licence
# file to ship beside them). The build refuses a wrong hash.
ARG SSCD_MODEL_URL=https://huggingface.co/nutszebra/sscd_onnx/resolve/main/sscd_disc_mixup.onnx
ARG SSCD_MODEL_SHA256=e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8
RUN mkdir -p /app/models && node -e 'const {createHash}=require("node:crypto");const fs=require("node:fs");(async()=>{const r=await fetch(process.env.SSCD_MODEL_URL);if(!r.ok)throw new Error("sscd model download failed: "+r.status);const b=Buffer.from(await r.arrayBuffer());const s=createHash("sha256").update(b).digest("hex");if(s!==process.env.SSCD_MODEL_SHA256)throw new Error("sscd model sha256 mismatch: "+s);fs.writeFileSync("/app/models/sscd_disc_mixup.onnx",b);console.log("sscd model verified ("+b.length+" bytes)");})().catch((e)=>{console.error(e.message);process.exit(1);})' && chmod 0444 /app/models/sscd_disc_mixup.onnx

# The SSCD model's copyright notice ships beside the weights (MIT).
RUN printf '%s\n' \
  "sscd_disc_mixup.onnx: SSCD copy-detection model descriptor," \
  "Copyright (c) Meta Platforms, Inc. and affiliates." \
  "Code and weights are licensed under the MIT License:" \
  "https://github.com/facebookresearch/sscd-copy-detection/blob/main/LICENSE" \
  "(weights confirmed MIT by the project's lead author, GitHub issue #12)." \
  "Provenance and licence analysis: asmita/docs/adr/008-sscd-second-layer.md" \
  > /app/models/SSCD-NOTICE.txt && chmod 0444 /app/models/SSCD-NOTICE.txt

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
