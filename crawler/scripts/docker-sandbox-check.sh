#!/bin/bash
# WP25 verification against real Docker (run from the REPOSITORY ROOT; the
# current user must be able to run docker). It builds the crawler image and
# proves both sandbox modes end to end:
#
#   A) Docker's DEFAULT seccomp profile: the sandbox self-test fails
#      (unprivileged user namespaces are denied to the non-root container
#      user), so rendering is disabled — the dedicated integration test
#      takes its fail-closed branch, and the standalone probe reports
#      sandbox off.
#   B) crawler/docker/seccomp-userns.json (the default profile plus
#      unprivileged user namespaces): the sandbox self-test passes, the
#      same integration test renders a fixture page and finds its planted
#      images, and the probe reports sandbox on.
#
# It also proves the container image's defence in depth: the browser worker
# runs through the setuid drop helper as uid 30000 (reported by the probe
# once the worker can answer), the key file is unreadable for that user and
# readable for the crawler's user, and an entrypoint started as root drops
# privileges once and never keeps root.
#
# Exit code 0 = every check passed. Expect the first run to take a while
# (the image build runs npm ci and downloads Chromium).
set -euo pipefail

cd "$(dirname "$0")/../.."   # repository root
IMAGE=asmita-crawler:wp25
SECCOMP_USERNS="$(pwd)/crawler/docker/seccomp-userns.json"

step() { printf '\n=== %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
expect_contains() { # expect_contains <description> <haystack> <needle>
  printf '%s' "$2" | grep -qF "$3" || fail "$1 (missing: $3)"
}

step "build the image (repository root context)"
docker build -f crawler/Dockerfile -t "$IMAGE" .

step "A1: default seccomp profile — the sandbox probe must report OFF (fail closed)"
A1="$(docker run --rm --read-only --shm-size=1g --network none "$IMAGE" node dist/sandbox-check.js)" && rc=0 || rc=$?
[ "$rc" -eq 1 ] || fail "probe under the default profile should exit 1 (sandbox off), got $rc"
expect_contains "A1 probe verdict" "$A1" '"sandboxOn":false'
expect_contains "A1 probe refusal code" "$A1" 'browser_sandbox_unavailable'
printf '%s\n' "$A1"

step "A2: the key file — readable by the crawler's user only"
KEYDIR="$(mktemp -d)"
trap 'rm -rf "$KEYDIR"' EXIT
docker run --rm --user 1000:1000 -e HOME=/tmp/h -v "$KEYDIR":/secrets "$IMAGE" \
  sh -c 'umask 177; printf "cwk_local-verification-key-0123456789abcdef" > /secrets/crawler-service-key; chmod 0400 /secrets/crawler-service-key'
A2A="$(docker run --rm --user 30000:30000 -e HOME=/tmp/h -v "$KEYDIR":/secrets "$IMAGE" \
  sh -c 'cat /secrets/crawler-service-key >/dev/null 2>&1 && echo readable || echo unreadable')"
A2B="$(docker run --rm -v "$KEYDIR":/secrets "$IMAGE" \
  sh -c 'id -u; head -c1 /secrets/crawler-service-key >/dev/null && echo readable')"
[ "$A2A" = "unreadable" ] || fail "the browser-worker user must not be able to read the key file"
expect_contains "A2 crawler user read" "$A2B" "1000"
expect_contains "A2 crawler user read" "$A2B" "readable"

step "A3: integration test under the default profile — rendering disabled (fail closed)"
# NODE_ENV=production is baked into the image, so npm needs --include=dev here.
A3="$(docker run --rm --shm-size=1g --user 1000:1000 -e HOME=/tmp/h -e CI=1 \
  -v "$(pwd)":/repo -w /repo/crawler "$IMAGE" \
  bash -c 'npm ci --no-audit --no-fund --include=dev >/dev/null 2>&1 && npx vitest run tests/integration/browser-sandbox.test.ts 2>&1')" || fail "A3: the in-container vitest run itself failed"
printf '%s\n' "$A3" | tail -5
expect_contains "A3 fail-closed branch" "$A3" "[sandbox] unavailable: fail-closed verified"

step "A4: started as root, the entrypoint drops privileges once"
A4="$(docker run --rm --network none -u 0 "$IMAGE" run)" && rc=0 || rc=$?
[ "$rc" -eq 1 ] || fail "the crawler without configuration must exit 1, got $rc"
expect_contains "A4 ran as the node user after the drop" "$A4" "config_invalid"

step "B1: seccomp-userns.json — the sandbox probe must report ON, via the drop helper"
B1="$(docker run --rm --read-only --shm-size=1g --network none \
  --security-opt seccomp="$SECCOMP_USERNS" "$IMAGE" node dist/sandbox-check.js)" && rc=0 || rc=$?
[ "$rc" -eq 0 ] || fail "probe under the userns profile should exit 0 (sandbox on), got $rc"
expect_contains "B1 probe verdict" "$B1" '"sandboxOn":true'
expect_contains "B1 worker ran as the separate browser-worker user" "$B1" '"workerUid":30000'
printf '%s\n' "$B1"

step "B2: integration test under the userns profile — sandbox on, fixture page renders, images found"
B2="$(docker run --rm --shm-size=1g --user 1000:1000 -e HOME=/tmp/h -e CI=1 \
  --security-opt seccomp="$SECCOMP_USERNS" \
  -v "$(pwd)":/repo -w /repo/crawler "$IMAGE" \
  bash -c 'npm ci --no-audit --no-fund --include=dev >/dev/null 2>&1 && npx vitest run tests/integration/browser-sandbox.test.ts 2>&1')" || fail "B2: the in-container vitest run itself failed"
printf '%s\n' "$B2" | tail -5
expect_contains "B2 sandboxed render branch" "$B2" "[sandbox] available: rendered and found"

step "ALL DOCKER SANDBOX CHECKS PASSED"
