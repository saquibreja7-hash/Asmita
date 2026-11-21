# AI Lab beta tools: progress

One entry per work package of asmita/docs/lab/beta-spec.md. Each entry starts with "### WPnn done".
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

### WP90 done

Detector panel at `/lab/detectors` (branch `feat/lab-beta-dev`, 2026-11-21).

**What was built**
- `src/lib/lab/detectors/adapters.ts` — the E1 detector adapter interface reused from `tools/lab-bench/src/detectors` (same `Detector`/`DetectionScore` shape, same skip-when-keyless rule, same defensive provider parsing, same injectable fetch for tests). Ported, not imported: lab-bench is a standalone offline package outside the app's build, so the Worker cannot reach it. Adapters: OpenAI vision (`OPENAI_API_KEY`, model `OPENAI_VISION_MODEL`, default `gpt-4o-mini`), Hive (`HIVE_API_KEY`), Sightengine (`SIGHTENGINE_USER`/`SIGHTENGINE_SECRET`). One deliberate difference from lab-bench: each adapter's options carry provider-prefixed field names, so no two adapters can ever read one another's credential through a shared options object (lab-bench's `apiKey` is shared by its OpenAI and Hive options; that latent collision is avoided here).
- `src/lib/lab/detectors/panel.ts` — `runDetectorPanel`: one row per detector in the fixed order openai, hive, sightengine. A scored row carries the score rounded to 0–100 and a verdict band (≥ 70 likely AI, < 30 likely camera, between unclear); a keyless adapter answers "not configured"; a failing or hung adapter (45 s wall clock) answers "error" with a fixed code and never sinks the others. `disagree` is true when at least two scored rows fall in different bands.
- `POST /api/lab/detectors` — `ENABLE_LAB` gate (503 `lab_disabled`), CSRF, declared-content-length pre-check, per-IP 10/hour (`checkRateLimitAsync`, `{ shared: true }`), strict Zod validation of the consent field, JPEG/PNG/WebP only with a server-side magic-byte sniff, 10 MB cap, and the site-wide `LAB_DETECTOR_DAILY_LIMIT` (default 200, 24 h fixed window) spent only by requests that passed every earlier check — the `OTP_GLOBAL_HOURLY_LIMIT` discipline. The image is held in memory for the one request and discarded: never stored, never logged (no bytes, filename or hash), sent only to the configured providers the WP names.
- Page `/lab/detectors` (404 while the Lab is off): visible "Beta: experimental" badge, the one-sentence limits note, the `/minor-support` under-18 pointer, an explicit consent tick that says where the image goes, results announced with `role="status"` and a focus move to the results heading, one primary action, 48 px button targets, both languages. Explainer: scores are guesses, the tools are weakest after WhatsApp-style recompression, a score is never proof, and nothing here should stop anyone reporting or asking for help.
- i18n: `lab.detectors.*` added to `en.json` and `hi.json` (Hindi machine-translated by Hermes (GLM 5.3), formal register, pending native review; the prefix is listed in `machineTranslated` in `hi-review-status.json`).

**Decisions recorded**
- No downscale before upload: the app has no sharp (lab-bench downscales with sharp first), so the image goes to the providers exactly as uploaded — already capped at 10 MB and sniffed to JPEG/PNG/WebP by the route.
- No local ONNX detector in the panel: the WP names the three hosted detectors; the community-forensics local model stays a lab-bench offline tool.
- Under-18 handling: the page carries the `/minor-support` pointer the rules require; the tool asks no age (it is not the complaint workflow), so there is no age gate to refuse on. The consent tick names the one thing that does happen: the image is sent to the configured detectors.
- `LAB_DETECTOR_DAILY_LIMIT` is not added to `.env.example` or `wrangler.jsonc`; WP96 collects the new env vars, and `ENABLE_LAB` stays `false` there.
- The e2e dev-server env pins `OPENAI_API_KEY` empty and sets no Hive/Sightengine keys, so the e2e's honest panel is three "not configured" rows — exactly what it asserts; nothing leaves the machine in tests.

**Checks**
- Unit: `tests/unit/lab-detectors.test.ts` (25) and `tests/unit/lab-detectors-route.test.ts` (11) — every adapter mocked, no network. Full asmita suite: 2189 passed, 3 skipped.
- E2E: `tests/e2e/lab-detectors.spec.ts` through `e2e-some.sh` (chromium, own Postgres): 2 passed — the en journey (badge, under-18 pointer, disabled-until-consent button, gradient PNG upload, three "not configured" rows, status announcement) and the hi journey at 320 px.
- Full checks (`check.sh`, Node 22): crawler lint/type-check/tests/build and asmita lint/type-check/prisma:validate/test — ALL CHECKS PASSED.

### WP91 done

Photo protection at `/lab/protect` (branch `feat/lab-beta-dev`, 2026-11-21).

**What was built**
- `src/lib/lab/protect/perturbation.ts` — the protective layer as one pure, dependency-free module: seeded uniform noise, an integer change in [-8, +8] for the red, green and blue channel of every pixel (the WP's epsilon <= 8/255, exactly 8 in 8-bit units), clamped to [0, 255] by the typed array, alpha untouched, deterministic per uint32 seed with a fresh crypto-random seed per run. The PRNG is the one lab-bench's fixtures use, kept as a copy because lab-bench sits outside the app's build.
- Page `/lab/protect` (404 while the Lab is off) with `ProtectPanel.tsx`: the whole tool runs in the visitor's browser — `createImageBitmap` (EXIF rotation applied) -> Canvas `getImageData` -> `protectPixels` -> `putImageData` -> a lossless PNG via `toBlob` -> an object-URL download. Before/after side by side as two labelled figures, the "they look the same on purpose" note, the download link, and the strong limits notice the WP requires (experimental, may not stop every tool, does not protect copies already online). Beta badge, the one-sentence limits note, the `/minor-support` under-18 pointer, results announced with `role="status"` and a focus move to the results heading, one primary action, 48 px button targets, both languages verified at 320 px. Caps enforced where the processing now happens, the browser: JPEG/PNG/WebP only, 10 MB, and a 25-million-pixel ceiling (the crawler's whole-image cap) so canvas memory stays bounded.
- i18n: `lab.protect.*` added to `en.json` and `hi.json` (27 keys; Hindi machine-translated by Hermes (GLM 5.3), formal register, pending native review; the prefix is listed in `machineTranslated` in `hi-review-status.json`).

**Decisions recorded**
- Where it runs — the WP's fallback ladder, step by step. No suitable model is available on the Worker: `onnxruntime-node` is native code workerd cannot load, and the SSCD weights are never in the repository (the crawler downloads them at image build time), so an `onnxruntime-web` fallback would have nothing to run either — and shipping ~98 MB of weights to every visitor is not reasonable. The documented simpler perturbation therefore applies.
- The Worker cannot run even the simple perturbation itself: it would first have to decode the photo, and the app has no server-side image decoder (WP90 recorded the same for downscaling; JPEG/WebP decode needs native code the Worker forbids). Per the WP's own line, the page works in the browser: the layer is added client-side and the photo never leaves the visitor's device — stronger than the WP's privacy minimum, since no copy is ever uploaded anywhere.
- Because there is no server half, there is no API route to rate-limit and `LAB_PROTECT_DAILY_LIMIT` has no server budget to spend; the cap is recorded here for WP96's env-var collection and becomes meaningful only if a server-side model ever arrives. Like WP90's `LAB_DETECTOR_DAILY_LIMIT`, it is not added to `.env.example` or `wrangler.jsonc`.
- The protected copy is a PNG on purpose: PNG is lossless, so the layer survives the download exactly. The limits notice says plainly that re-saving or compressing it again (a chat app's JPEG, for example) can weaken the layer.
- Measurement (aggregate numbers only, as the WP asks): 5 synthetic shape-drawn portraits (no person, no real photo), the exact shipped `protectPixels` (seeds 1,000,000 + i x 7,919) applied through the same path the browser runs (PNG -> RGBA -> noise -> PNG), embeddings from the pinned `sscd_disc_mixup` ONNX (sha256 e65e2a5b…, the lab-bench artifact, copied into the gitignored `tools/lab-bench/models/` for the run and deleted after) with the crawler's preprocessing (square 320x320 resize, ImageNet normalisation), onnxruntime-node on CPU inside the Node 22 container. The layer moves a photo's SSCD embedding by a cosine distance of min 0.1601 / median 0.1712 / mean 0.1739 / max 0.1987 (n=5). For scale, two different synthetic portraits sit at min 0.0181 / median 0.2660 / mean 0.2667 / max 0.5034 (n=10 pairs): the same photo after the layer lands about two-thirds of the way to where a different photo sits. This is evidence the layer is not cosmetic — measured against SSCD only, it is not a guarantee against any morphing tool, and the page says so.
- Under-18 handling: the page carries the `/minor-support` pointer the rules require; the tool asks no age (it is not the complaint workflow), so there is no age gate to refuse on. No consent tick is needed because nothing ever leaves the visitor's device; the uploader says so in plain words instead.

**Checks**
- Unit: `tests/unit/lab-protect.test.ts` (8) — the WP's required bound (max channel change <= epsilon = 8), clamping at 0 and 255, alpha untouched, the noise reaching the full +/-8 span and almost every pixel, determinism per seed, difference across seeds, uint32 seed range, and refusal of non-RGBA data and bad seeds. Full asmita suite: 226 files / 2200 tests passed (up from 225 / 2192).
- Lint: 0 errors, 6 warnings — 4 pre-existing in untouched files plus 2 new `@next/next/no-img-element` warnings on the before/after previews (the codebase's standing pattern for plain `<img>`; next/image cannot optimize blob: object URLs).
- E2E: `tests/e2e/lab-protect.spec.ts` through `e2e-some.sh` (chromium, own Postgres): 2 passed — the en journey (badge, under-18 pointer, disabled-until-photo button, generated gradient PNG upload, side-by-side pair, limits notice, and a real download: suggested filename `protected-photo.png`, PNG magic bytes on the saved file) and the hi journey at 320 px.
- Full checks (`check.sh`, Node 22): crawler npm ci, lint, type-check, 60 test files / 650 tests, build; asmita npm ci, prisma generate, lint, type-check, prisma validate, 226 test files / 2200 tests — **ALL CHECKS PASSED**.

### WP92 done

Public service-tracker numbers at `/lab/tracker` (branch `feat/lab-beta-dev`, 2026-11-21).

**What was built**
- `src/lib/lab/lab-stats.ts` — `labPublicNumbers()` extended additively to carry what the WP's page needs beyond the three standing public numbers: the status split (`servicesByStatus`), the E2 metric (`downWithin30Days`) and, per provider kind, `byKind: { reported, down, medianDays }`. A service is attributed to the kind of its FIRST sent report; `down` counts only takedowns that happened after that report (the same population the median is already drawn from). `labDashboardStats()` grew the matching per-kind counts (`byKind`); every existing field and consumer — the admin dashboard and the `/lab` aggregates — is unchanged. Still counts and medians only: no name, URL, provider or contact can ride in.
- Page `/lab/tracker` (404 while the Lab is off): three stat cards (services tracked, taken down, median days from first report to down), a small bar chart of services by status (pure CSS, no library: the label and the count are real text and the bar itself `aria-hidden`, so nothing is colour-only), the by-provider-kind table (reported / went down / median days, all seven kinds with an honest dash where no report has gone out yet, plus a sentence explaining the dash), and one sentence for the 30-day metric. An aggregate-numbers note under it all. While there is no data the page shows the honest empty state — announced with `role="status"`, no invented zeroes. A "How we count" section explains the method in plain words: what "taken down" means (every recorded address stops answering our check), how liveness is checked (one small daily request per address, nothing downloaded; any answer means active, none means down, the first fully-down day is kept, an answer later reactivates), what the median days mean, and which kinds of company get reports. Beta badge, the one-sentence limits note, the `/minor-support` under-18 pointer, a back link, both languages verified at 320 px.
- i18n: `lab.tracker.*` (43 keys) added to `en.json` and `hi.json` (Hindi machine-translated by Hermes (GLM 5.3), formal register, pending native review; the prefix is listed in `machineTranslated` in `hi-review-status.json`).

**Decisions recorded**
- The WP names `labPublicNumbers()` in `src/lib/lab/lab-stats.ts` as the single data source and also asks for a by-provider-kind table, which the three standing public numbers did not carry. The shared E2 stats module was therefore extended additively (new fields only) rather than given a tool-local copy: `lab-stats.ts` is the E2 aggregate module the WP itself points at, not another tool's folder, and the "own folders" rule was read as covering the tool folders. Verified: the `/lab` page, the admin dashboard and every existing test of these functions are untouched and still green.
- The chart shows the status split (down / active / unknown) — the one series that is a real "today" picture. The timeline data (median days) is a median, not a series, so it stays in the cards and the table rather than being faked into bars.
- The kind table lists all seven kinds, with a dash where nothing has been reported yet, rather than hiding empty kinds: the rows double as the plain-words list of which kinds of company chokepoint reporting targets.
- A service counts as `down` for its kind only when it went down after the first report, so a service that was already gone before we reported is not credited to the report (same rule the dashboard median always used).
- No API route: the page is a read-only server component rendering aggregates, so there is no input to validate, rate-limit or cap. The gate is the page's own 404-while-off.
- The 30-day metric sentence renders only when at least one report has been sent, so the tracking-but-not-yet-reporting state never shows a "0 of 0" line.
- Under-18 handling: the page carries the `/minor-support` pointer the rules require; the tool asks no age (it is not the complaint workflow), so there is no age gate to refuse on.

**Checks**
- Unit: `tests/unit/lab-tracker.test.ts` (6) — the honest empty state (all zeroes, null medians, per-kind zeros), the fixed shape of the public numbers (exactly the six top-level fields, so no field a name or URL could ride in on), the counts/statuses/medians and the 30-day metric, the first-report kind attribution, a takedown that happened before the first report not credited, and the WP's requirement itself: with invented services, chokepoints and reports seeded, the serialized public numbers contain no service name, URL, provider or abuse contact, plus a structural walk asserting the only strings anywhere in the object are the category enum names. Full asmita suite: 227 files / 2206 tests passed (up from 226 / 2200).
- Lint: 0 errors, 6 warnings — the same pre-existing 6 recorded under WP91 (4 in untouched files, 2 `no-img-element` on WP91's blob-URL previews); this WP added none.
- E2E: `tests/e2e/lab-tracker.spec.ts` through `e2e-some.sh` (chromium, own Postgres): 2 passed — the en journey (badge, under-18 pointer, honest empty state announced with `role="status"`, the method explained in plain words, and every anchor in the page content staying inside the site) and the hi journey at 320 px. One rerun was needed: the first EN journey failed on two test strings that ended in a period the source sentences do not carry (they continue with a comma); the strings were fixed, not the page.
- Full checks (`check.sh`, Node 22): crawler npm ci, lint, type-check, 60 test files / 650 tests, build; asmita npm ci, prisma generate, lint, type-check, prisma validate, 227 test files / 2206 tests — **ALL CHECKS PASSED**.

### WP93 done

Built the sextortion message check, `/lab/message-check` (branch `feat/lab-beta-win`).

What was built:
- `src/lib/lab/message-check/patterns.ts`: the eight pattern rules in code (payment demand, deadline or countdown, threat to send to family or contacts, claim of having intimate images, request for more images, impersonation of police or a platform, crypto or gift-card payment, foreign number pressure), each with an English, Hinglish and Devanagari regex set, plus the minor pathway reusing the home chat's `mentionsMinor` classifier. Every match is explained by reviewable copy in i18n (`lab.message-check.pattern.*`), never by generated text.
- `src/lib/lab/message-check/sarvam-summary.ts`: the optional short plain-language summary — one call to Sarvam's chat-completions API, the same endpoint, model, header and thinking-off setting as `/api/chat`, with the chat's `sanitizeModelReply` output guard so only links and numbers the site already publishes can appear in a summary. No key, a failed call or an unusable reply simply means no summary; the code results stand either way.
- `src/app/api/lab/message-check/route.ts`: 503 `lab_disabled` gate, CSRF before the payload is read, a 16 KB body cap (413 `payload_too_large`, the crawler routes' convention), strict Zod payload (text trimmed, 1-4,000 chars, locale en/hi), per-IP 10 checks/hour in a shared `checkRateLimitAsync` bucket plus the site-wide daily cap `LAB_MESSAGE_CHECK_DAILY_LIMIT` (default 500, not shared, like the chat's), the minor pathway from code before any model call, and nothing stored or logged — the security log records only event, route and reason.
- `src/app/(public)/lab/message-check/` page + `MessageCheckForm.tsx`: Beta: experimental badge, one plain cannot-do sentence, the `/minor-support` under-18 pointer, results announced with `role="status"` plus focus moved to the results heading, "What we noticed", "What to do now" (do not pay, do not send more, keep evidence, block after saving, report with `/get-help` and `/start` links) and the helplines 1930 / 181 / 112 with `tel:` links. The next-steps and helpline sections render before any check runs, so nobody has to run the tool first to find help. Both languages at 320px; no coloured stripes anywhere.
- i18n: 46 `lab.message-check.*` keys in `en.json` and `hi.json` (Hindi machine translated by Hermes (GLM 5.3), pending native review; prefix listed in `hi-review-status.json` under `machineTranslated.keys` — the existing `lab.*` entry already covered it, both kept for the per-WP paper trail).
- Tests: `tests/unit/lab-message-check-patterns.test.ts` (every pattern positive and negative, English/Hinglish/Hindi, canonical order and dedup, the minor rule), `tests/unit/lab-message-check-route.test.ts` (gate, CSRF, body cap, strict payload, both rate limits, the minor pathway before the model, exactly one Sarvam call and never the pasted links, output scrubbing, a stored-and-logged-nothing sentinel), and `tests/e2e/lab-message-check.spec.ts` (page journey, Hindi rendering, the minor pathway in the browser, API hygiene).

What was not verified on this machine:
- The Playwright spec has never executed (no Playwright and no Postgres here). It follows `lab.spec.ts` and `chat.spec.ts`; run it on the dev-vm through `e2e-some.sh` before relying on it.
- The Sarvam summary path is exercised only with `fetch` mocked; no live call was made (no key on this machine).
- The page was smoke-tested by hand in a local dev server (English and Hindi, 320px and desktop: the check runs, results, minor pathway and helplines all render, no horizontal overflow at 320px in either language), but no screenshot review happened on this machine.

Owner approval requested for the user-facing sentences (all in `lab.message-check.*`, with Hindi equivalents in `hi.json`):
- The limits sentence: "This tool cannot tell you who sent the message, it cannot check images, and it never opens links."
- The eight pattern explanations, e.g. "The message demands money. In these scams, paying almost never makes it stop — it usually brings more demands." and "The message threatens to send images or information to your family or contacts. That threat is the core of sextortion, and the sender rarely goes through with it — the demand is the point."
- The honest verdicts: "These are warning signs, not proof. People who send these messages often claim far more than they have." / "That does not mean the message is safe."
- The five next steps, in particular "Keep the evidence. Do not delete the chat: screenshots, numbers, usernames and dates help a later report."
- The AI notice: "If the short summary is available, the text goes to Sarvam, our AI service, to write that summary and nothing else."
- The helpline labels: Cybercrime helpline 1930, Women's helpline 181, Emergency, all-India 112.

Decisions I made myself:
- The minor pathway uses the home chat's `mentionsMinor` (both a self-report, "I am 15", and a third-person statement, "my daughter is 15"), so the two tools route exactly the same phrases and the Lab spec's under-18 rule errs towards the child-safety path; in both cases the tool does not run and the person is sent to `/minor-support`.
- The per-IP limit is 10 checks an hour (shared, so the E2E bypass lifts it); the site-wide daily cap is not shared. Body cap 16 KB; error codes follow the repo's conventions (`payload_too_large`, `invalid_payload`, `rate_limited`, `service_unavailable`).
- Over-matching is deliberate and disclosed: the patterns fire on everyday words in some phrasings ("pay the bill now"), and every result sentence is written as an indicator, never a verdict, per the spec's "results never claim certainty".
- The results copy lives in i18n and only pattern ids cross the wire, so every sentence the page can show is reviewable in one place (the chat route's fixed-reply pattern).
- `LAB_MESSAGE_CHECK_DAILY_LIMIT` (default 500) is this WP's env var; WP96 adds it to `.env.example` with the rest.
- The tool page was deliberately not added to the sitemap or the Lab hub; WP96 links every tool.

### WP94 done

Built the Content Credentials stamp, `/lab/stamp` (branch `feat/lab-beta-win`).

What was built:
- `src/lib/lab/stamp/stamp.ts`: the stamp operation on the C2PA engine the repo already ships. The manifest carries exactly what the WP names: the creator name the visitor typed (optional) as the `stds.schema-org.CreativeWork` author, "Meri Asmita Lab" as the claim generator info, the time of stamping on the `c2pa.created` action, and the do-not-train statement as `cawg.training-mining` with all four uses (AI training, generative AI training, inference, data mining) `notAllowed`.
- `src/lib/lab/stamp/cose.ts` + `cbor.ts`: the signing callback. The engine's wasm signer is a direct-COSE signer, so the COSE_Sign1 itself is built in JavaScript — CBOR tag 18, ES256 over WebCrypto (works in the Node dev server and workerd, P-1363 signatures, no Node crypto in route code), certificate in the protected x5chain header — with `reserveSize` computed to equal the exact COSE length, which is what makes the engine's data-hash exclusion line up.
- `src/lib/lab/stamp/engine.ts`: loads the site's own first-party `/c2pa/c2pa.wasm` (byte-identical, md5 4406cd90, to the engine package's file — the same file the on-device reader serves) from the request's own origin once per isolate, `initSync` on `@contentauth/c2pa-wasm` (the Rust core `c2pa-web` wraps), a minimal `FileReaderSync` shim only where the runtime lacks that Worker-only browser API, and stamp operations serialized per isolate.
- `src/lib/lab/stamp/signing-config.ts`: `LAB_C2PA_CERT`/`LAB_C2PA_KEY` (PEM) and `LAB_STAMP_DAILY_LIMIT` (default 200). Without the pair, the page explains signing is not configured and offers nothing.
- `src/app/api/lab/stamp/route.ts`: 503 `lab_disabled` gate, CSRF before the payload is read, a 10 MB body cap before and after parsing, strict multipart (one `image` part, at most one `creator` part of at most 100 characters), the type checked from the file's own magic bytes (JPEG/PNG/WebP), per-IP 10 stamps/hour in a shared bucket plus the site-wide daily cap, an invented download filename (`content-credentials.jpg|png|webp`) so the visitor's own filename never comes back, and nothing stored or logged — the image lives in memory for the one request.
- `src/app/(public)/lab/stamp/` page + `StampForm.tsx`: Beta: experimental badge, one plain cannot-do sentence, the `/minor-support` under-18 pointer, results announced with `role="status"` plus focus moved to the result heading, the download button and a link to the existing image checker to verify the file, and both languages at 320px.
- i18n: 30 `lab.stamp.*` keys in `en.json` and `hi.json` (Hindi machine translated by Hermes (GLM 5.3), pending native review; prefix added to `hi-review-status.json` under `machineTranslated.keys`).
- Tests: `tests/unit/lab-stamp.test.ts` — the WP's own test: a stamped image read back through the checker's reader shows the manifest (stamp with a throwaway self-signed key generated at runtime, read back through the same wasm core the browser reader wraps, mapped by the checker's own `summarizeManifestStore`; `validation_state` "Valid" with only the `signingCredential.untrusted` note, exactly like the committed c2patool fixture), plus PNG, the no-name variant, the reserveSize invariant and the first-party engine fetch; `tests/unit/lab-stamp-route.test.ts` (12 route tests including a real 200 stamp and a stored-and-logged-nothing sentinel); `tests/e2e/lab-stamp.spec.ts` (written for the dev-vm).
- `package.json`: `@contentauth/c2pa-wasm` 0.15.1 declared as a direct dependency (it was already installed as `c2pa-web`'s dependency; the lockfile change is one edge).

What was not verified on this machine:
- The Playwright spec has never executed (no Playwright and no Postgres here). It follows `lab-message-check.spec.ts`; the shared dev server it describes has no `LAB_C2PA_*` env, so it covers the not-configured page and the API hygiene. Run it on the dev-vm through `e2e-some.sh` before relying on it.
- No screenshot review happened on this machine (no multimodal model here). The page was verified mechanically in a real browser instead: at 320px in English and Hindi there is no horizontal overflow and no element wider than the viewport, and the full journey ran for real — stamping through the API from the browser returned bytes carrying the manifest, and the existing `/check-image` page read the stamped file back on-device: "This file carries Content Credentials. Made or edited with Meri_Asmita_Lab. Signed by Asmita Dev Smoke Signer. Signature check: Validated, but the signer is not on the public trusted list."
- WebP stamping was exercised only in a throwaway probe with a sharp-encoded input (it stamps and reads back Valid); the committed unit suite covers JPEG and PNG.
- workerd: the Lab is off in production (`ENABLE_LAB` false in `wrangler.jsonc`), so the route 503s there today. When the owner turns the Lab on, the engine fetch of own-origin `/c2pa/c2pa.wasm` and the `FileReaderSync` shim still want a worker-smoke run (WP96 runs one).

Owner approval requested for the user-facing sentences (all in `lab.stamp.*`, with Hindi equivalents in `hi.json`):
- The limits sentence: "This stamp cannot stop anyone editing or copying your photo, and it disappears from screenshots and from files re-saved without their metadata."
- The honest framing: "It is evidence, not protection: it does not stop anyone editing, screenshotting or re-sharing the photo, and many apps strip metadata on save. A signature from this tool proves the file passed through this tool — the name inside is the name that was typed, nothing more."
- The signer honesty: "Content Credentials is an open standard of the Content Authenticity Initiative. This beta stamps with the site's test certificate, which readers will show as an untrusted signer."
- The result sentence: "The download below is your photo with a Content Credentials manifest inside: your name (if you gave one), "created with Meri Asmita Lab", the date and time, and the statement that the image must not be used for AI training."
- The not-configured state: "This tool needs a signing certificate from the site's owner before it can stamp photos. None is configured at the moment, so there is nothing to try here yet."
- The privacy notice: "The photo is processed in memory for this one request and then discarded. It is never stored, logged or sent anywhere else."

Decisions I made myself:
- The do-not-train assertion is written under the live standard's name, `cawg.training-mining` (the CAWG assertion that replaced the C2PA 1.x `c2pa.training-mining` label the spec quotes), with all four uses `notAllowed` rather than a subset.
- Claims are signed as C2PA v1 (`claim_version: 1`). The v2 claim format requires an RFC 3161 trusted timestamp from a third-party time-stamping authority — a network service this tool must not call. v1 is what existing Content Credentials carry and validates as Valid on the checker's engine. c2pa-rs deprecates v1 signing from 0.92 and removes it in 0.93 (mid-January 2027); the engine is pinned (`@contentauth/c2pa-wasm` 0.15.1, core 0.92.2) so nothing breaks by itself, but before the next engine upgrade a trusted timestamp source must be chosen and the format moved to v2.
- The engine file is fetched from the site's own origin — the same first-party `/c2pa/c2pa.wasm` the on-device reader serves — rather than bundled, so no bundler-specific wasm handling enters the Worker build and the two tools provably run the same engine.
- Wrong file types answer 400 `invalid_payload` (the repo's convention) rather than 415; an empty file is 400, only an over-10 MB photo is 413.
- The per-IP limit is 10 stamps an hour (shared, so the E2E bypass lifts it); the site-wide daily cap is not shared — the WP93 pattern.
- The creator name is capped at 100 characters (the spec set no cap), trimmed, and only embedded when non-empty.
- Engine failures are logged on the console only; the security log keeps its existing event codes (no new union members outside the tool's folders).
- `LAB_STAMP_DAILY_LIMIT` (default 200) is this WP's env var; WP96 adds it to `.env.example` with the rest.
- The tool page was deliberately not added to the sitemap or the Lab hub; WP96 links every tool.

### WP95 done

Built the Spot the fake quiz, `/lab/spot-the-fake` (branch `feat/lab-beta-win`).

What was built:
- The ten rounds and their pictures: `public/lab/spot-the-fake/` — ten WebP scenes (6.9–15 KB each, under the spec's 150 KB cap) generated by the committed offline tool `tools/lab-spot-the-fake/generate.cjs` (sharp renders inline SVG; how to run is in its README). Every image is a synthetic flat vector drawing made for this quiz — no photograph, no real person, no third-party rights — and every "AI-made" round carries one genuine, findable tell (garbled sign text, a sixth finger, a shadow that contradicts the window light, bowed shelf and door lines, a gold hoop earring paired with a pearl drop, waxy poreless skin), so the game plays honestly even before real photographs arrive. The manifest `public/lab/spot-the-fake/quiz.json` lists per round the file, the answer (`real`/`ai`), the scene string used as the image's alt text, the one tell sentence in English and Hindi, and the source/licence.
- `src/lib/lab/spot-the-fake/quiz.ts`: the manifest's strict Zod schema, shared by the page and the unit test; file names are locked to `[a-z0-9-]+\.webp` so no manifest entry can ever point outside the tool's own public folder. This tool has no API route at all: no uploads, no server-side processing, nothing to rate-limit, cap or store — the quiz is a static manifest plus browser state, which is the spec's "state in the browser only" taken literally.
- `src/app/(public)/lab/spot-the-fake/` page + `SpotTheFakeQuiz.tsx`: Beta badge, one plain cannot-do sentence, the `/minor-support` under-18 pointer, the quiz (Start → ten rounds of Real / AI-made, the reveal announced through a screen-reader-only `role="status"` line with focus moved to the reveal heading, the next round's heading and the score heading — the message check's A5 pattern), the score with its honest "practice, not proof" message and Play again, and below the quiz the six-tells lesson and "What this game teaches" with the bridge to the image checker and `/get-help`. Both languages at 320px; the two answers are equal `btn-secondary` buttons so the design never hints which one is right, and the one `btn-primary` per view is always the single forward action (Start, Next, See your score, Play again); no coloured stripes anywhere.
- i18n: 45 `lab.spot-the-fake.*` keys in `en.json` and `hi.json` (Hindi machine translated by Hermes (GLM 5.3), pending native review; prefix added to `hi-review-status.json` under `machineTranslated.keys`, and the Hindi tell and scene sentences inside `quiz.json` noted in its `by` line — they live in the manifest, not the dictionaries).
- Tests: `tests/unit/lab-spot-the-fake.test.ts` — the spec's own test plus the spec's other hard rules: every entry has a file, an answer, both languages (plus scene and source); exactly ten rounds with both answers in play and ten distinct files; every file on disk exists, is a real WebP by its own magic bytes and stays under 150 KB; no URLs anywhere in the manifest; and the schema refuses traversal and junk strictly. `tests/e2e/lab-spot-the-fake.spec.ts` (written for the dev-vm): page honesty, a full ten-round play-through with the reveal and the score, and a Hindi round.

What was not verified on this machine:
- The Playwright spec has never executed (no Playwright and no Postgres here). It follows `lab-stamp.spec.ts` and `lab-message-check.spec.ts`; run it on the dev-vm through `e2e-some.sh` before relying on it.
- No screenshot review happened on this machine (no multimodal model here). The page was verified mechanically in a real browser instead: the full journey ran for real — Start, all ten rounds with every image loading, the reveal after every answer, the score ("You got 4 of 10 right" answering Real every time, matching the manifest's four real rounds), Play again restarting at round 1, and a full round in Hindi including the Hindi alt text and reveal; focus lands on the reveal heading after an answer; no horizontal overflow at 320px in English or Hindi in the ready, round and reveal states. The pictures themselves were also verified mechanically — each decodes at 960×600, the sign text renders, and each real/AI pair differs exactly in its tell's region (the per-pixel diff of the two streets stops at the sign boards, the two hands differ across the finger spread, the two still lifes only where the apple's shadow falls, the two rooms across every shelf, door and frame line, the two portraits across the face) — but no human or vision model has actually looked at them. The owner should eyeball the set before it ships.
- The lab-off gate was verified for real (an `ENABLE_LAB=false` dev server: `/lab/spot-the-fake` answers 404, same as `/lab/stamp`). Note the static files themselves (`quiz.json`, the WebPs) stay reachable by direct URL while the Lab is off — public assets are served by the platform directly, like every other public file; they contain only synthetic placeholder scenes and teaching sentences, nothing sensitive.

Owner approval requested for the user-facing sentences (all in `lab.spot-the-fake.*`, with Hindi equivalents in `hi.json`; the ten tell sentences live in `quiz.json`):
- The limits sentence: "This game cannot tell you whether a real image is AI-made — its pictures are stand-in drawings, and even experts are often wrong about the real thing."
- The score message: "This is practice, not a test of you: even people who study images for a living are often wrong. What stays with you is the habit of looking — at hands, writing, earrings, light, straight lines and skin — and of giving a doubtful image a proper check instead of a guess."
- The six tell sentences, e.g. "AI-made images garble signs, labels and text. Read every word in a picture before trusting it." and "Over-smooth, waxy skin with no pores or unevenness is a common AI signature on portraits."
- The bridge line: "If the image that worries you is real, these are the next steps:" with buttons to the image checker and Get help.
- The per-round tells in `quiz.json`, e.g. "Read the signs: BAEKRY for BAKERY, TAE for TEA — AI-made images often spell real words wrong." and "Count the fingers gripping the cup: there are six — extra or missing fingers are the classic AI slip."

Decisions I made myself:
- No images with a clear licence could be obtained on this machine, so per the spec I generated placeholder scenes and the owner must supply the final set. I went one step beyond abstract gradients: the committed generator draws ten flat vector scenes whose AI rounds each carry a real, findable tell, so the quiz is genuinely playable and teaches the six tells now; each entry's `source` field records the placeholder provenance and is where a replacement's licence goes.
- The set teaches six tells in ten rounds: four near-pairs (street text, hand, light, room) with one real and one AI round each, plus two single AI rounds (earrings, skin) — 4 real, 6 AI, in a deliberately non-alternating order (real, ai, real, ai, ai, real, real, ai, ai, ai) so the answer cannot be gamed by pattern.
- No shuffle: rounds play in manifest order, the authored teaching progression, which also keeps the e2e deterministic; "Play again" restarts the same order.
- No API route and no env var: nothing is uploaded, processed or stored, so the spec's API-hygiene and daily-cap rules have nothing to bind to; the only network request the quiz makes is the static manifest GET.
- Alt text names the scene ("A street with shop signs") in the visitor's language and never the answer.
- The privacy notice sits directly under the quiz; the six-tells lesson renders below the quiz so the categories can be revisited without playing.
- The tool page was deliberately not added to the sitemap or the Lab hub; WP96 links every tool.
