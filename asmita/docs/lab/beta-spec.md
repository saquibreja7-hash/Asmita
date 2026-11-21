# AI Lab beta tools: spec (WP89–WP96)

Owner-approved 2026-11-21 (Saquib). Builds on `asmita/docs/lab/charter.md`. Read the charter first; everything in it still holds (separate from the complaint workflow, `ENABLE_LAB` gate, lab ESLint boundary, public repo, no committed research data, the Lab never generates sexual content).

## Rules for every WP in this spec

- **Scope.** Only the AI Lab. The complaint-workflow safety rules in root `CLAUDE.md` do not apply. Never import complaint-workflow modules (cases, notices, hash submission, escalation, case-ops, store); ESLint enforces this.
- **Where code goes.** Each tool gets its own folders so WPs on different machines never touch the same files:
  - page: `asmita/src/app/(public)/lab/<tool>/`
  - API: `asmita/src/app/api/lab/<tool>/`
  - logic: `asmita/src/lib/lab/<tool>/`
  - i18n keys: `lab.<tool>.*` in **both** `asmita/src/i18n/en.json` and `hi.json` (Hindi may be machine translated; add the key prefix `lab.<tool>.*` to `machineTranslated` in `asmita/src/i18n/hi-review-status.json`).
  - tests: `asmita/tests/unit/lab-<tool>*.test.ts`, `asmita/tests/e2e/lab-<tool>.spec.ts`.
- **Do not edit** `asmita/src/app/(public)/lab/page.tsx`, the header or footer navigation, or another tool's folders. WP96 links every tool from the Lab page.
- **Gate.** Every page and API route answers 404 (page) / 503 `lab_disabled` (API) when `labEnabled()` from `src/lib/lab/flags.ts` is false. On in dev and test.
- **Beta label.** Every tool page shows a visible "Beta: experimental" badge and one plain sentence on what it cannot do. Results never claim certainty.
- **Under 18.** Every tool page carries the site's under-18 pointer (the existing `/minor-support` link pattern). A tool that asks for an age or detects a stated age under 18 sends the person to `/minor-support` and does not run.
- **Uploads.** Images are processed in memory for the one request and discarded: never stored, logged or sent anywhere not named in the WP. Max 10 MB, JPEG/PNG/WebP only, checked server side. Rate limit every API route with `checkRateLimitAsync` (per IP, `{ shared: true }`), plus a site-wide daily cap env var named in the WP.
- **API hygiene.** POST routes verify CSRF (`verifyCsrfRequest`), cap the body size, validate with Zod `.strict()`.
- **Design.** Follow `asmita/DESIGN.md`: semantic tokens, 12px corners for buttons and boxes (`--radius-box`), `.btn-primary` / `.btn-secondary` only, no coloured left-border stripes, both languages at 320px. Use the impeccable skill for layout and polish.
- **Accessibility.** Labelled inputs, keyboard reachable, results announced with `role="status"`, 44px targets.
- **Progress notes.** Append your WP entry to `asmita/docs/lab/beta-progress.md` (create it if missing). Do not write to `crawler/docs/v2-progress.md`.
- **Checks.** Lint, type-check and the unit suite must pass. Machines with Playwright also run the WP's e2e spec through `e2e-some.sh`.
- **Commits.** Clear message, ending with `Co-Authored-By: Hermes (GLM 5.3) <noreply@example.invalid>`.

---

## WP89 (dev-vm, branch `feat/lab-trace`, PR #108): fix the failing E3 e2e

The required "Playwright e2e (with Postgres)" check fails on PR #108 at `tests/e2e/lab-trace.spec.ts` ("an identical pair shows the strong-evidence band, honestly explained"). The CI log tail is given in your work package text. Find the real cause (in the code or a test that is wrong about deliberate behaviour) and fix it. Merge `origin/master` into the branch first. Run the lab-trace spec with `e2e-some.sh` until it passes, then the full checks.

## WP90 (dev-vm, branch `feat/lab-beta-dev`): detector panel, `/lab/detectors`

A visitor uploads one image and sees what several "AI-made or manipulated" detectors say, side by side.
- Reuse the E1 detector adapter interface if it exists on master (search `tools/lab-bench` and `src/lib/lab`); otherwise create `src/lib/lab/detectors/adapters.ts` with one interface and adapters for OpenAI vision (`OPENAI_API_KEY`), Hive (`HIVE_API_KEY`), Sightengine (`SIGHTENGINE_USER`, `SIGHTENGINE_SECRET`). An adapter whose key is unset is skipped and shown as "not configured".
- Results: one row per detector with its score (0–100) and verdict band (likely AI, unclear, likely camera), plus a "detectors disagree" note when bands differ. Plain explanation that detectors are often wrong, especially after WhatsApp compression.
- Daily cap env `LAB_DETECTOR_DAILY_LIMIT` (default 200).
- Unit tests mock every adapter (no network). E2E: upload a synthetic test image (generate a plain gradient PNG in the test), see the panel with "not configured" rows.

## WP91 (dev-vm, branch `feat/lab-beta-dev`): photo protection, `/lab/protect`

Before posting a photo, a visitor can add an invisible protective layer meant to make AI morphing harder.
- Server-side, CPU only: apply a bounded adversarial-style perturbation (e.g. PGD-style noise against an open face-embedding or SSCD model already used in the repo via onnxruntime-node, epsilon ≤ 8/255) and return the protected image for download. If no suitable model is available on the Worker, run in the browser with onnxruntime-web instead, or fall back to a documented simpler perturbation; record the choice in the progress notes.
- Show before/after side by side and a strong limits notice: protection is experimental, may not stop every tool, and does not protect copies already online.
- Measure and print in the progress notes how much the embedding distance moves on 5 synthetic portraits (aggregate numbers only).
- Daily cap env `LAB_PROTECT_DAILY_LIMIT` (default 100). If the Worker cannot run it within its limits, keep the page working in the browser.
- Tests: unit test for the perturbation bound (max pixel change ≤ epsilon); e2e upload + download button appears.

## WP92 (dev-vm, branch `feat/lab-beta-dev`): public service-tracker numbers, `/lab/tracker`

A public page with the E2 aggregate numbers, from `labPublicNumbers()` in `src/lib/lab/lab-stats.ts`: services tracked, taken down, median days from first report to down, and a by-provider-kind table (host, registrar, payment, app store…).
- Never names or links a service or provider. Honest empty state while there is no data. Small, accessible bar chart (no chart library; SVG or CSS).
- Explain the method in plain words (what "taken down" means, how liveness is checked).
- Tests: unit test that the page data contains no service names or URLs; e2e renders the empty state.

## WP93 (win-desktop, branch `feat/lab-beta-win`): sextortion message check, `/lab/message-check`

A visitor pastes the text of a threatening message or chat (text only, max 4,000 characters; no images, no links followed).
- Pattern rules in code first (`src/lib/lab/message-check/patterns.ts`): payment demand, deadline or countdown, threat to send to family or contacts, claim of having intimate images, request for more images, impersonation of police or a platform, crypto or gift-card payment, foreign number pressure. Each match gives a plain explanation.
- Then, if `SARVAM_CHAT_KEY` is set, one call to Sarvam (the same way `/api/chat` does) for a short plain-language summary and next steps; the code rules always run even without the key. A stated age under 18 in the text → minor pathway from code, before any model call. Links in the text are never fetched.
- Output: "What we noticed" list, "What to do now" (do not pay, do not send more, keep evidence, block after saving, report links to `/get-help` and `/start`), and the helplines (1930 cybercrime, 181, 112).
- Nothing is stored or logged. Daily cap env `LAB_MESSAGE_CHECK_DAILY_LIMIT` (default 500).
- Tests: unit tests for every pattern and the minor rule (invented text only); a test that no fetch happens for links.

## WP94 (win-desktop, branch `feat/lab-beta-win`): Content Credentials stamp, `/lab/stamp`

A visitor signs their own photo with C2PA Content Credentials so later copies can be traced to them.
- Use the C2PA library already in the repo (search for `c2pa` in `asmita/`; the image checker reads credentials). Write a manifest: creator name typed by the user (optional), "created with Meri Asmita Lab", timestamp, and an assertion that the image must not be used for AI training (`c2pa.training-mining` do-not-train).
- Signing key: a Lab test certificate from env `LAB_C2PA_CERT` and `LAB_C2PA_KEY` (PEM). If unset, the page explains signing is not configured and offers nothing. Never commit a key; tests generate a throwaway self-signed key at runtime.
- After stamping, offer the download and a link to the existing image checker to verify it.
- Daily cap env `LAB_STAMP_DAILY_LIMIT` (default 200).
- Tests: unit test that a stamped image read back through the checker's reader shows the manifest.

## WP95 (win-desktop, branch `feat/lab-beta-win`): Spot the fake, `/lab/spot-the-fake`

A short quiz (10 rounds) teaching people what manipulation looks like.
- Each round shows one image; the visitor answers "Real" or "AI-made", then sees the answer and one sentence on the tell (hands, text, earrings, lighting, background warping, skin texture).
- Images: only synthetic or consenting-adult, clothed, non-intimate, generic scenes (food, rooms, streets, landscapes, portraits of AI-generated people). Store them under `asmita/public/lab/spot-the-fake/` as WebP, each under 150 KB, with a manifest `quiz.json` listing file, answer, tell (en and hi), and source/licence. If you cannot obtain images with a clear licence, generate abstract placeholders and record in the progress notes that the owner must supply the final set.
- Score at the end with a plain message; no account, nothing stored (state in the browser only).
- Tests: unit test that every manifest entry has a file, an answer and both languages; e2e plays 10 rounds and sees a score.

## WP96 (dev-vm, integration branch `feat/lab-beta`): Lab hub and integration

Runs after WP89–WP95 are merged into `feat/lab-beta`.
- Update `asmita/src/app/(public)/lab/page.tsx`: a "Try the beta tools" section with one card per tool (trace, detectors, protect, tracker, message check, stamp, spot the fake), each with the Beta badge and one line on what it does; keep the existing experiments section. Both languages.
- Make sure all tool routes are in the sitemap and none are in the main header nav.
- Resolve anything the merge left inconsistent; run every lab e2e spec and the worker smoke (`npm run build:vinext`, `node scripts/prepare-production-wrangler.mjs`, `node scripts/worker-smoke.mjs`).
- Add the new env vars to `asmita/.env.example` with comments (no values for keys) and list them in `asmita/docs/lab/beta-progress.md`. Do not add any of them to `wrangler.jsonc`; `ENABLE_LAB` stays false there.
