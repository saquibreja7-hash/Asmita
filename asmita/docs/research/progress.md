# Research-grounded tools: progress

One entry per work package of asmita/docs/research/research-tools-spec.md. Each entry starts with "### WPnn done".

### WP114 done

Registry data model and the infrastructure scanner (Track C, `feat/nudify-registry`, win-desktop). Built on the AI Lab E2 tracker; nothing outside WP114's scope was touched.

**What was built**

- Registrable domains now come from the Public Suffix List: `lab-lookup.ts`'s last-two-labels guess is replaced by `tldts` (MIT, 7.5.5), exported as `registrableDomain()` and reused by the scanner.
- Prisma, additive migration `20261122100000_lab_infra_registry`: `LabProvider` (unique on name+kind), `LabInfraScan` (one scan of one service URL; no HTML stored), `LabInfraFinding` (unique on serviceId+category+value, `active` flag, first/last seen — never deleted, which is how "switched from X to Y" is derived), `LabServiceLink` (unique on A+B+reason+value), new enums (`LabInfraFindingCategory`, `LabInfraConfidence`, `LabServiceLinkReason`) and four new audit event values (`LAB_INFRA_SCAN_RUN`, `LAB_PROVIDER_CREATED`, `LAB_PROVIDER_UPDATED`, `LAB_FINDING_PROMOTED` — the last for WP115's promote action). Row-level security on all four tables like every other table. `lab-store.ts` gained the four memory tables for dev/tests.
- Scanner in `src/lib/lab/infra/`: `signatures.json` v1, 16 signatures written by us from the providers' own documentation (Stripe, Razorpay, PayPal, Coinbase Commerce; Google/Apple/Telegram login widgets and Discord OAuth; Cloudflare `cf-ray`, Fastly `x-served-by`, Akamai `AkamaiGHost` headers; GA4 `G-…`, GTM `GTM-…`, Meta pixel ids; AdSense), each entry carrying the documentation URL it came from. Extractors: crypto addresses with full checksum validation (BTC bech32/bech32m, BTC base58 P2PKH/P2SH, ETH EIP-55, TRON base58check — keccak-256 implemented locally to avoid a runtime dependency), Telegram links and bots, app-store, social, referral and model-repository links. The landing-page fetch is GET-only, cookieless, JavaScript-free, at most 3 redirects with the chain recorded, one 10 s budget, at most 1 MB, HTML/text content-type gated (media responses are never read), private/loopback/link-local hosts refused (the liveness guard, reused), User-Agent `AsmitaLab/1.0 (+research; contact on /lab)`; nothing the page references is ever fetched and the HTML itself is never stored. DNS A/AAAA/NS/MX; ASN and network name via RDAP IP against the IANA bootstrap (cached 24 h); registrar via domain RDAP (IANA bootstrap, `LAB_RDAP_BASE_URL` kept as an operator override); certificate issuer and SANs via crt.sh JSON (10 s, 200 entries).
- Change tracking per scan: findings in categories the run checked that the newest scan no longer sees become `active=false`; first-seen/last-seen preserved. Clustering after each scan: shared analytics ID, crypto address, IP (skipped when either service has an active CDN finding), exact NS set (skipped when every NS host is a big DNS provider's), and TLS SANs — idempotent `LabServiceLink` candidates for analysts to confirm or dismiss in WP115.
- Runs: `POST /api/lab/services/[id]/infra-scan` (admin, `lab:manage`, CSRF, rate-limited to 20/hour per admin) and the weekly `GET /api/lab/cron/infra-scan` (CRON_SECRET; answers 200 `lab_disabled` skipped while the Lab is off). Schedule `30 3 * * 1` added to `cronRoutes` in `cloudflare-worker.ts` and `triggers.crons` in `wrangler.jsonc`; `ENABLE_LAB` stays `false` there. Hard caps per run: 100 services, 300 URLs.
- Provider directory: lib CRUD with `LAB_PROVIDER_CREATED`/`LAB_PROVIDER_UPDATED` audit; seeds in `prisma/lab-provider-seeds.ts` (Cloudflare, Fastly, Akamai, Stripe, Razorpay, PayPal, Coinbase Commerce, Google, Google AdSense, Apple, Telegram, Discord) carry only names and each provider's own policy/abuse pages, all verified against the provider's site while building; abuse emails are empty for analysts to fill and every seed row is `verifiedAt = null`. A re-seed updates a row's URLs only while it is unverified and never touches an analyst's contact or verification.
- Licences recorded in `src/lib/lab/infra/THIRD_PARTY.md` (tldts MIT, bundled PSL MPL 2.0, Keccak reference constants).

**What was verified, and how**

- The checksum math was verified against independent reference implementations offline (js-sha3 for keccak-256, the `bech32` and `bs58check` npm packages) plus the public BIP-173/BIP-350/EIP-55 vectors. This found and fixed one wrong Keccak round constant (round 21 must be `0x8000000000008080`) and one bech32 converter that emitted a padding byte; both were caught before landing.
- 74 new or extended vitest cases (70 across the seven new files plus four new PSL cases in `lab-lookup.test.ts`): every extractor on invented HTML fixtures, all four crypto checksum families, signature and header matching, redirect cap (exactly 4 fetches then stop), 1 MB size cap, content-type gate, media-never-fetched (asserted on the requested URL list), private-host refusal including bracketed IPv6, the PSL cases the spec names (`example.co.in`, `a.b.example.com`, IP literals, IDNs), RDAP bootstrap/registrar/ASN and crt.sh parsing from synthetic JSON fixtures, `LAB_RDAP_BASE_URL` override, change tracking with the "switched" case, all five clustering rules and their guards, route auth/CSRF/rate-limit/caps, and the provider directory rules. Every fetch and DNS lookup in tests is mocked; no real site was touched from this machine.
- `powershell … check.ps1 -Repo … -Scope asmita`: ALL CHECKS PASSED (lint, type-check, 2380 tests). `prisma validate` passes.

**Not verified on this machine**

- Playwright is not installed here. `tests/e2e/lab-infra-scan.spec.ts` is written to the repo's not-yet-run convention: an admin scans a service whose URLs are an invented `.test` host that cannot resolve and this dev server's own loopback address (which the scanner must refuse), so the full Playwright run — later, on a Playwright machine — never fetches a real site either.
- The production Worker bundle (`npm run build`, `scripts/worker-smoke.mjs`) does not run in the lane checks; the scanner's Worker-specific risk (node:dns on workerd) is handled defensively (failures read as empty lookups, never errors) but was not exercised in workerd here.
- No scan of a real tracked service was run, by design: the scanner was exercised only against invented hosts and synthetic fixtures.
- crt.sh has no published rate-limit terms (community guidance suggests being gentle, ~1 request per 5 s); the weekly, ≤100-service cadence stays far below that, but the terms could not be formally verified.

**User-facing sentences the owner should approve**

WP114 ships no public pages and no admin UI — WP115 renders both — so the only user-facing strings to approve are:
- The scanner introduces itself to every scanned landing page as `AsmitaLab/1.0 (+research; contact on /lab)`.
- The provider directory seeds name the mainstream companies abuse reports go to (Cloudflare, Fastly, Akamai, Stripe, Razorpay, PayPal, Coinbase Commerce, Google, Google AdSense, Apple, Telegram, Discord), each with that company's own public policy or abuse page; no abuse email is pre-filled, and every row waits for an analyst's verification.
- For WP115's page copy, the honest description to carry over: the scanner fetches one 1 MB-capped, 10-second, no-JavaScript copy of a service's public landing page, records only the extracted evidence (never the page), and never fetches anything the page references.

**Decisions made myself**

1. The spec's "no real service names" rule (section 0.3) is read as covering the tracked nudify services, survivors and abuse URLs. The provider directory and signature list necessarily name the mainstream companies reports are sent to — the same convention the complaint workflow's platform table already follows — and every name carries its own verified documentation or abuse-page URL. Test fixtures use invented `example.test` hosts everywhere except the signature hosts themselves, which must appear for matching to be provable.
2. `ANALYTICS_ID` findings store tag ids only, never shared script hosts, so `SHARED_ANALYTICS_ID` clustering cannot fire on "everyone uses gtag".
3. TLS SANs are stored under the `TLS_ISSUER` category as registrable-domain values carrying a "CT SAN" evidence marker; clustering matches only that marker, so a shared certificate issuer never links two services.
4. The shared-IP CDN guard is two-sided: a pair is skipped when either service has an active CDN finding.
5. The liveness private-host guard (reused by the scanner) now strips IPv6 brackets, which it previously missed — a safety fix to existing shared code, noted in the commit.
6. Microsoft's login widget had no provider-documented fixed host I could verify, so it is absent from signatures v1 (the spec listed it as a candidate, not a requirement). Meta has no seed row because no abuse page was verified this session; the directory gains it when an analyst verifies one. Hugging Face and Civitai appear as MODEL_REPO_LINK findings but have no matching `LabChokepointKind`, so no provider rows exist for them.
7. The big-DNS-provider list for NS clustering is a curated suffix list (cloudflare.com, googledomains.com, Route 53 `awsdns-*`, registrar-servers.com, domaincontrol.com and others); analysts extend it as they meet more.
8. Findings belong to the service, and the scan row they point at is the newest scan of the run that saw them.
9. keccak-256 was written from the algorithm description rather than vendoring a library, to keep the runtime dependency list unchanged; its constants were verified entry by entry against js-sha3's published table.
10. Provider re-seeds never touch a verified row, mirroring the platform seed's no-clobber rule.
11. The weekly cron slot is Monday 03:30 UTC (`30 3 * * 1`), clear of the daily 02:45 liveness run; the spec says "weekly" without a time.
12. The e2e spec (not run on this machine) deliberately uses an unresolvable invented host and a loopback address, so the later Playwright run also never fetches a real site.
