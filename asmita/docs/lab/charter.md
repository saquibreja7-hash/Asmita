# Meri Asmita AI Lab: charter

Owner-approved 20 November 2026 (Saquib).

## Purpose

The Lab runs experiments across the whole problem of AI-generated and morphed intimate images: stopping them being made, tracking where they spread, and getting them taken down. It is separate from the survivor complaint filing workflow. The complaint workflow's rules in root CLAUDE.md do not apply here (see its 'Scope' section).

## Where it lives

- Same site, same repo. Public pages under `/lab` (English and Hindi). Admin pages under `/admin/lab` (English, like the rest of admin), behind a new `lab:manage` permission.
- Code: `src/app/(public)/lab/`, `src/app/admin/lab/`, `src/app/api/lab/`, `src/lib/lab/`. Offline tools in `tools/lab-*/` at the repo root.
- Database tables start with `Lab`.
- One switch, `ENABLE_LAB` (read in one helper, like `crawler-flags.ts`). On in dev and test. Off in `wrangler.jsonc` until the owner turns it on.
- Boundary, enforced by ESLint `no-restricted-imports`: lab code never imports complaint-workflow modules (cases, notices, hash submission, escalation, case-ops, store), and complaint code never imports lab code. Shared basics (db, auth, csrf, rate limit, i18n, UI components) are fine.
- The no-URL-fetch lint rule and `tests/integration/no-url-fetch.test.ts` guard the complaint workflow. Narrow them so they do not apply to lab paths (`src/lib/lab/**`, `src/app/**/lab/**`, `tools/lab-*/**`). They must keep covering complaint code exactly as before.

## Data

- The repo is public. Research data lives in the database or local disk and is never committed. This covers real service names and URLs, campaign data, per-detector failure examples and test images.
- Fixtures in tests are invented (`example.test` domains, made-up names).
- Test images are synthetic faces or photos of consenting adults, clothed and non-intimate. The Lab never generates sexual content.

## How an experiment runs

Each experiment has a card: question, method, data, metric, stop rule, result. Results go in `asmita/docs/lab/<id>.md`: methodology and aggregate numbers only.

## E1: detector benchmark and morph-robust matching (`tools/lab-bench`)

Question: which 'AI-made / manipulated' detectors, and which matching methods, hold up on Indian faces and WhatsApp-compressed morphs?

- Test-set builder: from a local folder of portraits, make variants:
  - a face-swap composite (landmark-aligned face paste with seamless blending, CPU only)
  - crop, resize, mirror, text or sticker overlay, screenshot with borders
  - WhatsApp-style re-encode (long edge 1600, JPEG quality about 70)
  It also accepts a local labelled folder from a public deepfake dataset.
- Matching methods, scored against a distractor set:
  - PDQ (reuse `asmita/src/lib/pdq`)
  - SSCD (ONNX, loaded the same way as the crawler branch `origin/feat/crawler-sscd`, `crawler/src/image/sscd-pool.ts`)
  - PDQ on the face crop only
  - PDQ on the background with the face masked out
  Metric: recall at a 1% false-match rate, per transform.
- Detectors behind one adapter interface:
  - OpenAI vision (`OPENAI_API_KEY`)
  - Hive (`HIVE_API_KEY`)
  - Sightengine (`SIGHTENGINE_USER`/`SIGHTENGINE_SECRET`)
  - one open local model through onnxruntime-node if public weights exist
  An adapter whose key is unset is skipped. Metric: AUC and accuracy per transform.
- Output: a local HTML/Markdown report (gitignored). Only the aggregate table goes in `asmita/docs/lab/e1.md`.
- Stop rule: if no method beats plain PDQ by 20 recall points on face-swap plus WhatsApp, E3 uses PDQ plus SSCD only.

## E2: nudify-service map and chokepoint reporting (`/admin/lab/services`)

Question: do services that make 'undress' or face-swap images go down faster when we report them to the companies they depend on?

- Tables:
  - `LabService`: name; kind (app, website, Telegram or chat bot, channel, social account); URLs; status (active, down, unknown); first seen; last checked; notes.
  - `LabChokepoint`: service; kind (host, CDN, registrar, payment processor, app store, ad network, platform account); provider; abuse contact entered by an analyst from the provider's own abuse page; evidence notes.
  - `LabReport`: chokepoint; channel (email or web form); sent at; provider reference; outcome (actioned, refused, no reply) and outcome date.
- Admin pages: list and edit services and chokepoints. Add a report: draft from a template per chokepoint kind, filled from the service data. The analyst reviews it, then sends it by email (Resend, lab sender) or copies it for a web form. Record the outcome.
- Helpers: a domain lookup (DNS plus RDAP) that suggests host and registrar for a service URL. A daily liveness check (Cron Trigger route) that marks each service URL up or down.
- Dashboard: services by status, reports outstanding, and median days from first report to down, per provider kind.
- Public `/lab` page: what the Lab is, the experiments, and aggregate E2 numbers (services tracked, taken down, median days). It never names or links a service.
- Metric: share of services down within 30 days of the first report.

## E3: morph-to-source tracing (after E1 and the SSCD branch merge)

Question: can we show automatically that a morph was made from her photo?

- `/lab/trace`: upload the suspect image and one or more originals.
- The method E1 picks scores whole-image, face-region and background-region similarity, aligns the images and highlights the matching regions.
- Output: an evidence PDF with the images side by side, the scores and a plain method statement, usable by survivors, NGOs and police. It can be attached to a complaint later but is not part of filing.
- Metric: on the E1 test set, the right source is found 95% of the time with at most 1% wrong-source matches.
