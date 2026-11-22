#!/bin/sh
# Container entrypoint (WP25). The image's default user stays the non-root
# "node" (the crawler's user, which owns the key file). `run` / `run --loop`
# start the crawler; anything else (node dist/sandbox-check.js, sh -c ...) is
# executed as given, so `docker run asmita-crawler node dist/sandbox-check.js`
# works without re-invoking the crawler.
#
# When the platform starts the container as root, this script does the one
# privileged thing needed — hand the mounted key file to the crawler's user
# alone (0400, so the separate browser-worker uid the setuid helper drops to
# cannot read it; best effort on read-only mounts) — then drops privileges
# ONCE, to the node user, and never keeps root. Without setpriv it refuses
# to run as root rather than widen the window.
set -e
if [ "${1:-run}" = "run" ]; then
  set -- node dist/main.js "$@"
fi
if [ "$(id -u)" = "0" ]; then
  f="${CRAWLER_SERVICE_KEY_FILE:-}"
  if [ -n "$f" ] && [ -f "$f" ]; then
    chown node:node "$f" 2>/dev/null || true
    chmod 0400 "$f" 2>/dev/null || true
  fi
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --clear-groups "$@"
  fi
  echo "entrypoint: started as root and setpriv is missing; refusing" >&2
  exit 1
fi
exec "$@"
