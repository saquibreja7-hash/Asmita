# AI Lab beta tools: progress

One entry per work package of asmita/docs/lab/beta-spec.md. Each entry starts with "### WPnn done".

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
