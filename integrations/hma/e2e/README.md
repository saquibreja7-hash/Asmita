# Asmita ↔ HMA end-to-end test

The `tx-extension-asmita` package (this directory's sibling) inside a real
Hasher-Matcher-Actioner, pulling the WP110 signal feed
(`/api/partner/v1/signals`) from a real Asmita dev server, against a real
Postgres — the research-tools spec WP111's end-to-end proof:

1. two synthetic, consented fingerprints are seeded into the Asmita dev
   server through its real routes (survivor registration, case, fingerprint
   upload, analyst approval, the partner-sharing agreement — see `seed.mjs`);
2. HMA is registered against that server (`POST /c/exchanges`, bank
   `ASMITA_NCII`) and its fetcher imports the signals;
3. `GET /m/lookup?signal_type=pdq&signal=<hash>` returns a match in
   `ASMITA_NCII`;
4. the second survivor withdraws her consent; after the next fetch her
   fingerprint's lookup returns no match (the tombstone deleted it) while
   the first survivor's still matches;
5. `run-e2e.sh` prints PASS or FAIL.

## Running it

```bash
./run-e2e.sh            # from this directory
```

Requirements: Docker with the compose plugin, Python 3.12+ with pip (the
script builds the wheel from `../tx-extension-asmita`), Node 18+ for the
seed journey. The first run is slow: it pulls the official HMA image
(pinned by digest), a Postgres 17 image and a Node 22 image, and runs
`npm ci` inside the Asmita image.

`KEEP=1 ./run-e2e.sh` leaves the stack running for inspection
(`docker compose logs hma`, the HMA UI on http://127.0.0.1:5100, the
Asmita dev server on http://127.0.0.1:3000); the default tears everything
down and deletes the volume.

## What is in here

| File | What it is |
|---|---|
| `docker-compose.yml` | Postgres, HMA's own migration container, HMA with the wheel installed, and the Asmita Next dev server with its own throwaway database |
| `run-e2e.sh` | The orchestrator: build, boot, seed, register, fetch, assert, withdraw, fetch, assert, PASS/FAIL |
| `seed.mjs` | Drives the Asmita app's real HTTP routes (no browser): the full partner and survivor journeys |
| `omm_config.py` | The OMM config with `AsmitaSignalExchangeAPI` (and `VPDQSignal` when the vpdq extension is installed) |
| `hma-asmita.Dockerfile` | The official HMA image + the wheel |
| `asmita.Dockerfile` | The Asmita app tree + `npm ci`, self-contained (no bind mounts, nothing it writes reaches the checkout) |
| `asmita-entry.sh` | The dev server container's entry: wait for Postgres, `prisma migrate deploy`, the least-privilege login role, the seed, then `npm run dev` |
| `postgres-init.sh` | Creates the Asmita database on HMA's Postgres |

## Honest scope notes

- The dev server runs with a database, not the in-memory store: the app's
  partner-share consent route is deliberately database-only (it answers
  `503 database_required` without `DATABASE_URL`), so a memory store cannot
  hold a consented fingerprint at all. The stack therefore gives the dev
  server its own throwaway Postgres and the seeding goes through the same
  real routes the WP110 Playwright journey uses.
- The legal-review and admin-MFA gates are satisfied inside the throwaway
  database exactly the way the Playwright `global-setup` does it (the
  template is marked reviewed by the script playing the human reviewer, and
  the synthetic admin gets a confirmed enrolment row). `DEV_SKIP_LEGAL_REVIEW`
  and `DEV_SKIP_ADMIN_MFA` stay off.
- Every value here is synthetic and disposable: invented `example.invalid`
  and `example.test` addresses, deterministic fake PDQ hashes, throwaway
  keys that live only in the container volume. Nothing real, nothing
  pushed, no production system touched.
