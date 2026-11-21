#!/bin/bash
# End-to-end test: the tx-extension-asmita exchange inside a real HMA
# (Open Media Match) pulling the WP110 /signals feed from a real Asmita dev
# server (research-tools spec WP111, item 2).
#
#   1. build the wheel, build the two derived images, start the stack
#      (docker-compose.yml: Postgres, HMA, the Asmita dev server);
#   2. seed two synthetic consented fingerprints through the app's real
#      routes (seed.mjs) — partner application, admin approval, key issue,
#      two survivor journeys, analyst approval, the sharing agreement;
#   3. create the exchange (POST /c/exchanges, bank ASMITA_NCII) with the
#      seeded partner's key;
#   4. wait for HMA's fetcher, then GET /m/lookup must return a match in
#      ASMITA_NCII for both fingerprints;
#   5. withdraw the second survivor's consent in the app, wait for the next
#      fetch: her fingerprint's lookup must return no match (the tombstone
#      deleted it), the other survivor's must keep matching;
#   6. print PASS or FAIL. Exit non-zero on FAIL.
#
# Everything is local and throwaway: published ports stay on 127.0.0.1, the
# database lives in a compose volume that is destroyed at the end (unless
# KEEP=1), the only networks touched are docker's own.
#
# Prerequisites: docker with the compose plugin, python3 (3.12+) with pip
# for the wheel build, node (18+) for seed.mjs. If the HMA image cannot run
# on this machine, this script still stops at the first failing step with a
# clear message instead of pretending.

set -euo pipefail
cd "$(dirname "$0")"

PYTHON_BIN="$(command -v python3.12 || command -v python3)"
HMA=http://127.0.0.1:5100
ASMITA=http://127.0.0.1:3000
BANK=ASMITA_NCII
STATE=e2e-state.json
FETCH_WAIT_SECONDS=240
POLL_SECONDS=5

say() { printf '\n== %s ==\n' "$*"; }
fail() { printf '\nFAIL: %s\n' "$*"; exit 1; }

jsonget() { # jsonget '<json>' '<python expr on d>'  |  jsonget - '<expr>' reads stdin
  local expr="$2"
  if [ "$1" = "-" ]; then
    "$PYTHON_BIN" -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$expr"
  else
    "$PYTHON_BIN" -c "import json,sys; d=json.loads(sys.argv[1]); print(eval(sys.argv[2]))" "$1" "$expr"
  fi
}

wait_for() { # wait_for <url> [extra curl args...] — 200 within $1 seconds
  local url="$1"; shift
  local waited=0
  until curl -sf -o /dev/null "$@" "$url"; do
    sleep "$POLL_SECONDS"; waited=$((waited + POLL_SECONDS))
    [ "$waited" -ge "$FETCH_WAIT_SECONDS" ] && return 1
  done
  return 0
}

say "building the tx-extension-asmita wheel"
WHEEL="$(ls ../tx-extension-asmita/dist/tx_extension_asmita-*.whl 2>/dev/null | head -n1 || true)"
if [ -z "$WHEEL" ]; then
  (cd ../tx-extension-asmita && "$PYTHON_BIN" -m pip wheel --no-deps --wheel-dir dist . >/dev/null)
  WHEEL="$(ls ../tx-extension-asmita/dist/tx_extension_asmita-*.whl | head -n1)"
fi
echo "wheel: $WHEEL"

say "building the images (first build pulls base images and runs npm ci: slow)"
REPO_ROOT="$(cd ../../.. && pwd)"
docker build -q -t asmita-hma-e2e-asmita:latest -f "$REPO_ROOT/integrations/hma/e2e/asmita.Dockerfile" "$REPO_ROOT"
BUILDKIT_PROGRESS=plain docker compose build

say "starting the stack"
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
docker compose up -d postgresql
docker compose up -d asmita
say "waiting for the Asmita dev server (next dev compiles on demand)"
if ! wait_for "$ASMITA/api/csrf"; then fail "the Asmita dev server did not come up (see: docker compose logs asmita)"; fi
echo "asmita dev server is up"

say "satisfying the legal and MFA gates in the throwaway database (like the Playwright global-setup)"
PSQL="docker compose exec -T postgresql psql -U postgres -d asmita_hma_e2e"
$PSQL -c "UPDATE \"NoticeTemplate\" SET \"reviewedByLegal\" = true WHERE \"templateType\" = 'PARTNER_SHARING_CONSENT' AND \"isActive\";" >/dev/null
ADMIN_HASH="$(printf '%s' 'hma-e2e-admin@example.invalid' | sha256sum | cut -d' ' -f1)"
$PSQL -c "INSERT INTO \"AdminMfaSecret\" (\"emailHash\", \"secretEncrypted\", \"enrolledAt\", \"confirmedAt\") VALUES ('$ADMIN_HASH', 'unused', now(), now()) ON CONFLICT (\"emailHash\") DO NOTHING;" >/dev/null
echo "template reviewed, admin enrolled"

say "starting HMA (migrations, then the app)"
docker compose up -d migrations
docker compose up -d hma
say "waiting for HMA to answer"
if ! wait_for "$HMA/c/exchanges"; then fail "HMA did not come up (see: docker compose logs hma)"; fi
echo "hma is up"

say "seeding two synthetic consented fingerprints through the real routes"
rm -f "$STATE"
node seed.mjs apply
APPLICATION_ID="$($PSQL -tAc "SELECT id FROM \"PlatformPartnerApplication\" ORDER BY \"createdAt\" DESC LIMIT 1" | tr -d '[:space:]')"
[ -n "$APPLICATION_ID" ] || fail "no partner application in the database"
node seed.mjs finish "$APPLICATION_ID"

PARTNER_KEY="$(jsonget "$(cat "$STATE")" "d['partnerKey']")"
KEEP_HASH="$(jsonget "$(cat "$STATE")" "d['keep']['hash']")"
WITHDRAW_HASH="$(jsonget "$(cat "$STATE")" "d['withdraw']['hash']")"
[ -n "$PARTNER_KEY" ] && [ -n "$KEEP_HASH" ] && [ -n "$WITHDRAW_HASH" ] || fail "seed state is incomplete"

say "sanity: /signals serves both fingerprints to this partner key"
SIGNALS="$(curl -sf -H "Authorization: Bearer $PARTNER_KEY" "$ASMITA/api/partner/v1/signals")"
COUNT="$(jsonget "$SIGNALS" "len(d['records'])")"
echo "signals records served: $COUNT"
[ "${COUNT:-0}" -ge 2 ] || fail "expected at least 2 records on the signal feed"

say "creating the exchange on HMA (bank $BANK, api asmita)"
curl -sf -X POST "$HMA/c/exchanges" -H 'content-type: application/json' -d "{
  \"bank\": \"$BANK\",
  \"api\": \"asmita\",
  \"api_json\": {\"base_url\": \"http://asmita:3000/api/partner/v1\"},
  \"credential_json\": {\"api_key\": \"$PARTNER_KEY\"}
}" >/dev/null || fail "POST /c/exchanges was refused"

lookup() { # lookup <hash> — prints the comma-joined banks that matched.
  # /m/lookup with an explicit signal_type answers keyed by bank directly.
  curl -sf "$HMA/m/lookup?signal_type=pdq&signal=$1&seed=asmita-hma-e2e" \
    | "$PYTHON_BIN" -c 'import json,sys; print(",".join(sorted(json.load(sys.stdin))))'
}

say "waiting for HMA's fetcher to import the signals"
fetch_ok() {
  [ "$(jsonget "$(curl -sf "$HMA/c/exchange/$BANK/status" 2>/dev/null || echo '{}')" "d.get('last_fetch_succeeded')" || true)" = "True" ]
}
waited=0
until fetch_ok; do
  curl -sf -X POST "$HMA/dev/run_fetch" -o /dev/null 2>/dev/null || true
  sleep "$POLL_SECONDS"; waited=$((waited + POLL_SECONDS))
  [ "$waited" -ge "$FETCH_WAIT_SECONDS" ] && break
done
# The lookup needs the fetch, an index rebuild and an index-cache refresh
# (10s + 5s intervals in omm_config.py), so poll until it settles.
matched=""
waited=0
until [ "$(lookup "$KEEP_HASH")" = "$BANK" ]; do
  sleep "$POLL_SECONDS"; waited=$((waited + POLL_SECONDS))
  [ "$waited" -ge "$FETCH_WAIT_SECONDS" ] && break
done
matched="$(lookup "$KEEP_HASH")"
[ "$matched" = "$BANK" ] || fail "no match for the kept fingerprint in $BANK (got: '$matched')"
matched="$(lookup "$WITHDRAW_HASH")"
[ "$matched" = "$BANK" ] || fail "no match for the to-withdraw fingerprint before the withdrawal"
echo "both fingerprints match in $BANK"

say "withdrawing the second survivor's sharing agreement in the app"
node seed.mjs withdraw

say "waiting for the next fetch: the withdrawn fingerprint must stop matching"
curl -sf -X POST "$HMA/dev/run_fetch" -o /dev/null 2>/dev/null || true
waited=0
until [ -z "$(lookup "$WITHDRAW_HASH")" ]; do
  curl -sf -X POST "$HMA/dev/run_fetch" -o /dev/null 2>/dev/null || true
  sleep "$POLL_SECONDS"; waited=$((waited + POLL_SECONDS))
  [ "$waited" -ge "$FETCH_WAIT_SECONDS" ] && break
done
matched="$(lookup "$WITHDRAW_HASH")"
[ -z "$matched" ] || fail "the withdrawn fingerprint still matches (banks: '$matched')"
matched="$(lookup "$KEEP_HASH")"
[ "$matched" = "$BANK" ] || fail "the kept fingerprint stopped matching after the other's withdrawal (got: '$matched')"
echo "deletion applied: the withdrawn fingerprint no longer matches, the kept one still does"

say "exchange status"
curl -sf "$HMA/c/exchange/$BANK/status" | "$PYTHON_BIN" -m json.tool || true
docker compose logs hma 2>/dev/null | tail -n 5 || true

if [ "${KEEP:-0}" != "1" ]; then
  say "tearing the stack down (KEEP=1 to keep it)"
  docker compose down -v --remove-orphans >/dev/null
fi

printf '\nPASS\n'
