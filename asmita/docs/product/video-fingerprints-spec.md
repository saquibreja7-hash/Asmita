# Video fingerprints: specification and work packages

Owner decision, 19 November 2026 (Saquib): photos are done; add videos. Survivors fingerprint their own videos privately, Asmita sends notices for them, and the crawler finds copies of them on the web.

Read first: root `CLAUDE.md`, `asmita/AGENTS.md`, "Rules that do not change" in `crawler/docs/full-crawler-spec.md` (they apply here unchanged), `asmita/docs/adr/006-hash-matching-crawler.md`, and the draft `asmita/docs/adr/007-video-fingerprints.md`.

## The method: vPDQ

A video is fingerprinted by sampling **one frame per second**, computing the existing PDQ hash of each frame (`asmita/src/lib/pdq/pdq.ts`, `computePdqHash`), and keeping a deduplicated list of frame hashes. vPDQ is Meta's published method (ThreatExchange, BSD licence); implement it from this description in our own code, reusing our PDQ.

- **Sampling:** one frame per second of playback; frames with PDQ quality below 50 are dropped.
- **Dedup:** a frame whose hash is within Hamming distance 10 of the previous kept frame is dropped (still scenes collapse to one hash).
- **Caps:** videos up to 60 minutes; at most 1,000 kept frames per video (if more survive dedup, keep an evenly spaced 1,000).
- **Match rule (Phase 2, crawler):** an online video or set of preview images matches a survivor video when at least 3 sampled frames (or 1 preview image, for thumbnail matching) are within the PDQ match threshold (`PDQ_MATCH_THRESHOLD`, 31) of that survivor video's frames. Analysts review every match, as for images.

## Rules specific to video

1. **The video never leaves her device.** Only frame hashes, frame qualities and timestamps reach the server. The no-media rule, its schema checks and tests apply unchanged: no frame image, data URL or bytes in any request.
2. A video fingerprint is one `HashSubmission` with `algorithm = VPDQ`, so review, consent (`hashSubmissionIds`), signing (`signedHashSubmissionIds`), deletion and purge work for it without parallel paths.
3. Until Phase 2 is built, `/api/crawler/pool` must not return VPDQ submissions (the crawler would misread them).
4. New survivor-facing wording goes into `en.json` and `hi.json`; new Hindi keys are listed as machine translated in `hi-review-status.json`. Notice and annex wording that a platform reads is legal text: write it plainly, never set `reviewedByLegal`, and record in the progress notes that counsel must read it.
5. Tests use synthetic videos only: generate them with ffmpeg's test sources (for example `testsrc`/`smptebars` plus moving shapes), WebM/VP9, a few seconds long, and commit them under `asmita/tests/fixtures/video/` (keep each under 300 KB). Never a real or intimate video.

## How this runs (Hermes)

Two parallel lanes, each on its own branch cut from `feat/video-fingerprints`; WP numbers continue the crawler spec. Progress notes go to `crawler/docs/v2-progress.md` under a `## Video` heading. Checks and commit rules are those of `crawler/docs/full-crawler-spec.md` "How to work".

- Lane V1 (`feat/video-v1`): WP17, then WP19
- Lane V2 (`feat/video-v2`): WP18

Both lanes code against the API contract in WP17, written out below so V2 can work in parallel.

## Phase 1 work packages (start now)

### WP17. Video fingerprints on the server (app)

- Prisma: add `VPDQ` to `HashAlgorithm`; add nullable columns to `HashSubmission`: `videoFramesEncrypted String?` (the frame list, JSON, encrypted with `encryptField`), `videoFrameCount Int?`, `videoDurationSec Int?`. Additive migration. For a VPDQ row, `hashEncrypted` holds the highest-quality frame's hash, `quality` that frame's quality, and `hashDigest` is the sha256 of the sorted unique frame hashes (so the existing unique index dedups re-uploads).
- API `POST /api/cases/[caseId]/hashes` accepts, alongside the existing image items, video items: `{ kind: "video", frames: [{ hash: 64-hex, quality: 0..100, t: seconds 0..3600 }] (1..1000), durationSec: 1..3600, clientVersion?: string }`. Strict Zod; reject anything else; same declaration, rate limit (a video counts as one item) and CSRF as today. Existing image requests are unchanged (`kind` defaults to image).
- Memory store, Prisma and Kysely paths all; account deletion and case purge remove the frames with the row.
- Admin: the Fingerprints page and case page show a video as "Video · N frames · M:SS" with the same approve/reject actions. Survivor case page: "Video N ••••••••" like images.
- Crawler pool: exclude VPDQ rows (rule 3) with a test.

Done when: route, store and migration tests (valid video item, too many frames, bad hex, data-URL smuggling attempt rejected, dedup by digest, deletion removes frames, pool excludes VPDQ) pass on all backends.

### WP18. Fingerprint a video in her browser (client)

- New module `asmita/src/lib/pdq/vpdq.ts`: pure functions for sampling decisions, dedup and capping (unit-tested without a browser), plus a browser sampler that loads her chosen file through an object URL into a hidden `<video>`, seeks to each whole second, draws the frame to a canvas, hands the drawn frame to the hashing Web Worker as a transferable ImageBitmap (WP42; hashed off the main thread, same worker as images, main-thread path where no worker can run), and yields `{ hash, quality, t }`. Cancelable, reports progress, frees the object URL, canvas and frame bitmaps when done.
- Survivor UI on the submit page (where images are fingerprinted today, `SubmitForm.tsx`) and on her dashboard's add flow: accept video files (`video/*`), show progress ("Reading your video on this device: 42%"), say clearly that the video is not uploaded, then submit the result as a WP17 video item. Unsupported codec or a read failure shows a kind message and suggests converting or choosing another file; nothing is sent.
- Limits from "The method": 60 minutes, 1,000 frames; longer videos are refused before reading with a clear message.

Done when: unit tests for sampling, dedup and caps; a Playwright test (chromium) that fingerprints a committed synthetic WebM and submits the expected frame count; a test that no request body ever contains image or video data.

### WP19. Videos in notices, consent and review (app)

- `asmita/src/lib/case-hash-annex.ts` is the single annex builder: a VPDQ submission appears as one annex entry "Video fingerprint (vPDQ, N frames)" followed by its frame hashes (at most 200, evenly spaced if more), with one plain sentence saying how vPDQ is matched (PDQ per frame at one frame per second, Hamming distance). Signing records the submission id as for images; dispatch sends exactly the signed set (existing integrity rules).
- The crawl authorisation's fingerprint list names video fingerprints as "Video fingerprint, N frames" (the template text itself is not edited).
- Admin approval of a video fingerprint behaves like an image (auto-dispatch of a signed hash advisory only to the platforms on her signed advisory list).
- Mark in the progress notes: the annex wording is new platform-facing text for counsel to read.

Done when: annex, sign and dispatch tests with a mix of image and video fingerprints prove the email body and the signed PDF list the same entries, and that a video added after signing is not sent under that signature.

## Phase 2 work packages (start after crawler v3 is merged; not assigned yet)

### WP20. Video frames in the crawler pool and matcher (app + crawler)

`/api/crawler/pool` returns approved, consented VPDQ submissions as `{ id, kind: "video", frames: [64-hex] }`. The crawler builds an in-memory index over all frame hashes (multi-index hashing or a BK-tree, so lookups stay fast at 100k+ frames) and reports matches with the same finding contract (the finding's fingerprint id is the video submission). Logs carry counts only.

### WP21. Match video previews (crawler)

Treat video posters, `og:video` preview images, JSON-LD `VideoObject.thumbnailUrl`, video-sitemap `<video:thumbnail_loc>` and preview sprite sheets (split a sprite into its tiles in the decoder child) as image candidates tagged "video preview", fingerprint them like images, and compare them with video frames as well as image fingerprints (match rule: one preview within threshold). No video bytes are fetched in Phase 2.

## Phase 3 (later, needs ADR 007 accepted and a security review)

Sample real videos: byte-range sampling of progressive MP4 and every Nth segment of HLS/DASH, decoded by ffmpeg inside the isolated decoder child, memory-only, with per-video byte and time budgets and no DRM circumvention.
