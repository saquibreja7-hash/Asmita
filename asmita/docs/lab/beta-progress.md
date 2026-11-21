# AI Lab beta tools: progress

One section per work package of `docs/lab/beta-spec.md` (WP89–WP96), appended
as each WP lands: what was built, what was verified on the machine that wrote
it, and the decisions the implementer made alone.

---

### WP89 done

Fixed the failing "Playwright e2e (with Postgres)" check on PR #108
(branch `feat/lab-trace`, head `c2e9da0` at the start of this WP).

**What actually failed.** The work-package text names
`tests/e2e/lab-trace.spec.ts` ("an identical pair shows the strong-evidence
band, honestly explained"), but that failure belongs to the earlier CI run
(06:45 on `b114ca8`) and was WP88's strict-mode fix (`d861ef1`). In the CI run
whose tail was handed to this WP (08:01 on `c2e9da0`, run 44882917709 — fetched
in full with `gh run view --log-failed`) all three lab-trace journeys pass and
the whole Playwright suite is green (83 passed); the job dies one step later,
at `node scripts/worker-smoke.mjs`, which runs after the suite in the same CI
job:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '.../asmita/src/lib/lab-models' imported from '.../asmita/src/lib/csp.ts'
```

**Root cause.** `scripts/worker-smoke.mjs` imports TypeScript modules straight
out of `src/` and runs them with plain Node (type stripping), where every
relative import must carry its explicit `.ts` extension. The trace WP added
`import { labTraceConnectOrigins } from "./lab-models"` to
`src/lib/csp.ts` (the CSP builder needs the model origins for `connect-src`),
extensionless — the smoke step crashed at startup. The crash was reproduced
exactly on this machine with the same interpreter (Node 22.23.5) before
touching anything.

**The fix (code, not a test; no assertion was changed).**

- `src/lib/csp.ts` imports `./lab-models.ts` with the explicit extension,
  with a comment saying why the extension is load-bearing. Same module, same
  functions, same CSP — no behaviour change at all.
- `tsconfig.json` gains `allowImportingTsExtensions: true` (valid and needed
  because `noEmit` is already set; without it `tsc --noEmit` rejects the
  explicit extension). It permits but never requires extensions, so no other
  file is affected.
- New regression guard `tests/unit/worker-smoke-imports.test.ts`: it reads
  `scripts/worker-smoke.mjs`, loads under plain Node (the same interpreter the
  smoke step uses) every module the script imports from `../src/`, and checks
  the exact named bindings the script destructures — so this class of failure
  is caught by the unit suite, not only by CI.

**Verified on this machine (Node 22 container, same version as CI).**

- The crash reproduces before the fix (`ERR_MODULE_NOT_FOUND … lab-models`)
  and is gone after: `import('./src/lib/csp.ts')` under plain Node answers
  `CSP_REPORT_PATH = /api/csp-report`.
- Targeted vitest run: 5 files / 56 tests pass, including the new guard
  (2 tests), `csp.test.ts` (16) and the three trace suites (38).
- The full failing CI job's steps, end to end against a throwaway local
  Postgres 17 (schema reset, `prisma migrate deploy`, seed — the same shape
  Playwright's global-setup gives CI): `npm run build:vinext` builds clean
  with the extensioned import, `scripts/prepare-production-wrangler.mjs`
  prepares the production config, and `node scripts/worker-smoke.mjs` prints
  "Worker smoke passed" — a step that had never run successfully on this
  branch before.
- `e2e-some.sh` on `tests/e2e/lab-trace.spec.ts`: **3 passed** (identical
  pair strong band, unrelated images no-evidence band, /lab page link).
- Full `check.sh`: `ALL CHECKS PASSED` — crawler 60 test files / 650 tests,
  asmita 227 test files / 2196 tests, lint 0 errors (4 pre-existing warnings,
  none in a touched file), type-check and `prisma validate` clean.

**Not verified here.** The PR's own CI re-run — nothing was pushed; that is
the owner's step. Nothing else: the fix is three files and every CI step of
the failing job ran locally on Node 22.

**Decisions made on my own.**

- The work-package text and the CI log tail disagree (the text names the
  lab-trace test, the log shows the worker-smoke crash). I treated the log as
  authoritative: the lab-trace failure was real but already fixed by WP88, and
  the check that still fails is the smoke step in the same CI job.
- Chose the explicit-extension import over the alternatives (passing origins
  into `buildCsp` from its callers, duplicating the origins helper inside
  `csp.ts`, or hardcoding the report path in the smoke script): it is the
  smallest change, keeps `lab-models.ts` the one place that reads the model
  env vars, and matches the extensioned style `worker-smoke.mjs` itself
  already uses for the specifiers it imports.
- The WP text ends by asking to append this entry to
  `crawler/docs/v2-progress.md`; the same text (and beta-spec rule 22) says
  progress for these WPs goes to `asmita/docs/lab/beta-progress.md` instead
  and never to `crawler/docs/v2-progress.md`. I followed the spec: this file
  is the only progress entry.
- `asmita/docs/lab/beta-spec.md` (owner-approved 2026-11-21) was untracked in
  this lane checkout; it is committed with this WP so the repo holds the spec
  its progress file refers to, like `charter.md` and `progress.md` already do.
