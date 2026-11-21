# AI Lab beta tools: progress

One entry per work package of asmita/docs/lab/beta-spec.md. Each entry starts with "### WPnn done".

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
