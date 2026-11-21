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
