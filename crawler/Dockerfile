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
#
# WP25 (the browser sandbox) adds three things to the image:
#   - the "browser-worker" user (uid/gid 30000) and a tiny setuid-root
#     helper, /usr/local/bin/asmita-browser-drop (root:root, 4755), which
#     drops the browser worker onto that uid before node starts — the same
#     pattern as Chromium's own chrome-sandbox helper. The crawler spawns
#     the worker through it (CRAWLER_BROWSER_WORKER_HELPER is set below),
#     so a renderer exploit runs as a user that cannot read the key file
#     (owned by the crawler's user, mode 0400 — the entrypoint fixes that
#     when the platform starts the container as root) nor the parent's
#     /proc/<pid>/environ. The worker's environment never holds the key in
#     the first place (browserWorkerEnv is a fixed allowlist).
#   - an entrypoint (docker/entrypoint.sh) that, when started as root,
#     hands the mounted key file to the crawler's user and drops
#     privileges ONCE to the node user; nothing keeps root afterwards.
#     Started non-root (the image default, and how Cloudflare Containers
#     runs it) it just execs the crawler.
#   - Chromium's own sandbox is left ON: the crawler self-tests it at the
#     first browser launch and fails closed (no --no-sandbox is ever passed
#     on a working sandbox). Docker's default seccomp profile denies the
#     unprivileged user namespaces it needs; run with
#     --security-opt seccomp=crawler/docker/seccomp-userns.json to allow
#     them (scripts/docker-sandbox-check.sh proves both modes).

FROM node:22-bookworm-slim AS build
WORKDIR /src/crawler
COPY crawler/package.json crawler/package-lock.json ./
RUN npm ci
COPY crawler/ ./
COPY asmita/src/lib/pdq/pdq.ts /src/asmita/src/lib/pdq/pdq.ts
COPY asmita/src/lib/crawl-page-key.ts /src/asmita/src/lib/crawl-page-key.ts
RUN npm run build
# The setuid drop helper for the browser worker (WP25). Compiled in the
# build stage only; gcc never reaches the runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && gcc -O2 -Wall -Wextra -DWORKER_UID=30000 -DWORKER_GID=30000 \
       -o /out-browser-drop /src/crawler/docker/asmita-browser-drop.c

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
# The browser worker runs as its own unprivileged user (WP25): a renderer
# exploit then cannot read the key file or the parent's environment.
RUN groupadd -g 30000 browser-worker \
    && useradd -u 30000 -g 30000 -r -M -s /usr/sbin/nologin browser-worker
COPY --from=build /out-browser-drop /usr/local/bin/asmita-browser-drop
RUN chown root:root /usr/local/bin/asmita-browser-drop && chmod 4755 /usr/local/bin/asmita-browser-drop
COPY --chmod=0555 crawler/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
ENV NODE_ENV=production \
    VIPS_DISC_THRESHOLD=2g \
    TMPDIR=/nonexistent-no-temp-files \
    PLAYWRIGHT_BROWSERS_PATH=/app/browsers \
    BROWSER_TMP_DIR=/dev/shm \
    CRAWLER_BROWSER_WORKER_HELPER=/usr/local/bin/asmita-browser-drop \
    NODE_OPTIONS=--max-old-space-size=1536
# main.js (crawler), decoder-worker.js (isolated decoder child process),
# browser-worker.js (isolated Chromium child process, WP7) and
# sandbox-check.js (the WP25 standalone probe; no key, no network)
COPY --from=build /src/crawler/dist/ ./dist/
# "type": "module" for dist/main.js
COPY crawler/package.json ./package.json
USER node
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["run"]
