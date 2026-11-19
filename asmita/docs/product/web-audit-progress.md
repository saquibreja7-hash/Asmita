# Web best-practice audit — progress

Each work package from the web best-practice audit (accessibility, forms,
performance, security headers) records here what changed, what was not
verified, any user-facing sentence that needs the owner's approval, and any
decision the implementer made on their own. The audit items were owner-approved
on 20 November 2026 (Saquib).

## WP46 — Security headers (branch feat/csp-reporting-headers)

Items: S4 ('report-sample'), S5 (CSP violation reporting), S6 (QR SVG without
dangerouslySetInnerHTML + report-only Trusted Types), S7 (Permissions-Policy
extension), S8 (COOP/CORP).

### What changed

- S4 — `src/lib/csp.ts` now appends `'report-sample'` to `script-src` and
  `style-src` in every environment. `'strict-dynamic'` is still absent (the
  Sarvam voice worklet on /talk needs the current blob: source list); the test
  suite pins both facts.
- S5 — the CSP carries `report-uri /api/csp-report` and
  `report-to csp-endpoint`; `next.config.ts` sends
  `Reporting-Endpoints: csp-endpoint="/api/csp-report"` with it. New route
  `src/app/api/csp-report/route.ts` (logic in `src/lib/csp-report.ts`)
  accepts only `application/csp-report` and `application/reports+json`,
  caps the body at 8 KB (declared content-length refused first, then the read
  body measured — the same shape as the crawler routes' caps), throttles per
  network with the existing shared Postgres rate-limit buckets (60 per 10
  minutes), reduces every URL to an origin or a path (query and fragment
  stripped), logs only `directive`, `blockedOrigin` and `documentPath`, and
  answers 204. Anything that is not a CSP report gets 415 (wrong content
  type) or 400 (wrong shape). Reports are console-logged only, never stored
  in the database.
- S6 — the admin MFA enrolment QR (`src/app/admin/setup-mfa/EnrolMfa.tsx`) is
  now an `<img src="data:image/svg+xml,...">` (encodeURIComponent) instead of
  dangerouslySetInnerHTML; this was the only usage in the repo. The existing
  `img-src 'self' data:` already allows data: images on that page, so no CSP
  change was needed. A separate `Content-Security-Policy-Report-Only` header
  carries `require-trusted-types-for 'script'`; the enforced CSP never does,
  so nothing is blocked yet.
- S7 — Permissions-Policy denies `payment`, `usb`, `serial`, `bluetooth`,
  `accelerometer`, `gyroscope`, `magnetometer`, `display-capture` and
  `browsing-topics`. The camera/geolocation rules are unchanged and /talk
  keeps `microphone=(self)` exactly, on both the catch-all and the /talk
  override.
- S8 — `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Resource-Policy: same-origin` are sent from the catch-all
  header list, so pages, /api and static assets all carry them. No COEP. The
  /talk voice flow was checked: it uses a WebSocket and a same-origin blob
  worklet, never a cross-origin window (no window.open/opener anywhere in
  src).
- Production consistency: production pages get their CSP from the Worker
  entry via the same `buildCsp`, so the Worker needed no separate edit; all
  other headers come from `next.config.ts`, which also drives the vinext
  Worker build.

Tests: `tests/unit/csp.test.ts` extended (report-sample, report-uri/report-to,
endpoint-name consistency, Trusted Types report-only separation, updated exact
policy strings); new `tests/unit/csp-report-route.test.ts` (content types,
8 KB cap, per-network rate limit, URL stripping and log hygiene);
`scripts/worker-smoke.mjs` extended to assert the new headers on /, /talk and
/api/health, and to POST both report formats (204) plus a non-report (415).

### Not verified here

- The Playwright suite and the Postgres e2e were not run on this machine (they
  run in the separate verify step). No new Playwright spec was required for
  this WP.
- `scripts/worker-smoke.mjs` (workerd, Postgres) was not run on this machine;
  its new assertions were written to match the behaviour verified locally
  with `npm run dev` (all headers present on /, /talk and /api/health; the
  report endpoint answered 204/415/400/405/413 as designed) and `npm run
  build`.
- Browser-side reporting itself (an actual violation arriving at the endpoint)
  can only be confirmed in production, where the reports now start flowing.

### User-facing text needing owner approval

- New alt text on the admin MFA QR image: "Authenticator setup QR code"
  (screen readers only; visible layout unchanged).

### Decisions made on my own

- Reports are logged with `console.info` only, not `logSecurityEvent`:
  SecurityEventLog is for security-relevant admin-visible events, and CSP
  reports are high-volume, untrusted telemetry.
- The Report-Only Trusted Types policy also carries the reporting directives,
  so its violations reach the same endpoint and can be measured before any
  enforcement decision.
- Rate limit 60 reports per 10 minutes per network: reports are best-effort;
  dropping surplus ones costs nothing, and the bucket is shared per network as
  the other public routes are.
- The QR alt text is English-only, like the rest of the admin workspace (the
  admin section does not use the i18n dictionary; no new en.json/hi.json
  keys were added).
- COOP and CORP are sent on the catch-all list, so static assets carry CORP
  too (stops other sites embedding them; nothing on this site loads its own
  resources cross-origin).
- The body cap follows the repo's existing pattern (declared content-length
  pre-check, then `request.text()` measured against the cap) rather than a
  stream reader, which the repo's lint rules forbid (`request.body` access).
