# The Asmita Next dev server for the HMA end-to-end test.
#
# Build context: the REPOSITORY ROOT (see docker-compose.yml), so `asmita/`
# is in the context. The whole app tree is copied and `npm ci` runs inside
# the image (its postinstall generates the Prisma client and copies the
# c2pa/lab assets), so the container is self-contained: no bind mounts, and
# nothing it writes (`.next/`, logs) ever lands in the host checkout.
#
# The partner-share consent route is deliberately database-only in the app
# (it answers 503 without DATABASE_URL), so a memory store cannot hold a
# consented fingerprint: the compose stack gives this dev server its own
# throwaway database and seeds two consented synthetic fingerprints through
# the app's real routes, exactly like the WP110 Playwright journey.

FROM node:22-bookworm-slim

# The app's dependency tree vendors its own Node runtime (the `node` npm
# package, pulled in by the Cloudflare tooling): its binary links
# libatomic.so.1, which slim images do not ship. Without this, npm ci's
# lifecycle scripts (which put node_modules/.bin first on PATH) run that
# binary instead of the image's node and die with exit 127.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libatomic1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The full tree before npm ci: the postinstall step needs prisma/ and
# scripts/ (prisma generate, copy-c2pa-assets, copy-lab-assets).
COPY asmita/ ./
RUN npm ci

COPY integrations/hma/e2e/asmita-entry.sh /app/asmita-entry.sh
RUN chmod +x /app/asmita-entry.sh

EXPOSE 3000
ENTRYPOINT ["/app/asmita-entry.sh"]
