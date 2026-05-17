# Hindi Marketing Translation — Translator Handoff

**Version:** 1.0
**Created:** 2026-05-17
**Status:** Draft inventory; awaiting native-speaker translator

---

## Background

Asmita supports two launch languages: English and Hindi (per PRD v0.2). The persistent UI chrome — navigation, support panel, age attestation, declaration — is already drafted in `src/i18n/hi.json` but **marked `DRAFT_REQUIRES_NATIVE_SPEAKER_REVIEW`** in `src/i18n/hi-review-status.json`. The marketing pages — homepage, /how-it-works, /resources, /faq, /privacy, /terms, /start, /minor-support — currently render English text inline in JSX and are **not yet translated at all**.

This document is the handoff. It lists every translatable string on the marketing pages, organised by page, so a native Hindi-speaking translator can produce trauma-informed translations without having to read the codebase.

## Policy: AI-translated Hindi is NOT acceptable for production

`hi-review-status.json` makes this explicit:

> AI-drafted Hindi strings. Do not mark production-ready until reviewed by a native Hindi speaker for trauma-informed tone, gender-inclusive verb forms, and legal-citation accuracy.

Translations in this handoff **must not** come from Google Translate, DeepL, ChatGPT, Claude, or any other machine translation system without a native speaker's review and edits. The audience is survivors of non-consensual intimate imagery; tone matters as much as accuracy.

## Tone & style guidance

When translating:

1. **Trauma-informed register.** Calm, plain, non-clinical. Avoid government-portal stiffness ("कृपया प्रदान करें") and avoid sales-pitch warmth ("हमारे साथ जुड़ें")—aim for the register a counsellor uses on the phone.
2. **Gender-inclusive verb forms.** The user may be a woman, non-binary, or a supporter helping someone. Use forms like `करती/करता हूं` rather than presuming gender. Existing `hi.json` keys follow this pattern — match them.
3. **Brand:** `Asmita` and `अस्मिता` are both acceptable; prefer `अस्मिता` in body copy, `Asmita` in headings where the English wordmark is visible.
4. **Legal citations** (IT Rules 2021, DMCA, Section 67, etc.) — keep English / numeric citation strings verbatim. The legal review partner (IFF or SFLC.in) needs to recognise the exact citation.
5. **English fragments** that survivors will recognise from official forms ("FIR", "Grievance Officer") — keep English in parentheses after the Hindi term, e.g. `शिकायत अधिकारी (Grievance Officer)`.
6. **CTAs** ("Start a case", "Read the FAQ") — translate to active, gentle Hindi imperatives. Not commands.

## Scope of this batch

Pages in scope, by priority:

| Priority | Page | Source file | Approximate strings |
|---|---|---|---|
| 1 | Homepage | `src/app/(public)/page.tsx` | ~25 |
| 2 | Start (entry) | `src/app/start/page.tsx` | ~20 |
| 3 | How it works | `src/app/(public)/how-it-works/page.tsx` | ~40 |
| 4 | FAQ | `src/app/(public)/faq/page.tsx` | ~30 (English half only; Hindi half already drafted inline — verify) |
| 5 | Resources | `src/app/(public)/resources/page.tsx` | ~50 |
| 6 | Minor support | `src/app/minor-support/page.tsx` | ~15 |
| 7 | Privacy promise | `src/app/(public)/privacy/page.tsx` | ~150 |
| 8 | Terms | `src/app/(public)/terms/page.tsx` | ~110 |

Total: ~440 strings. We recommend translating in priority order and shipping in two batches (priorities 1–5, then 6–8).

## Delivery format

Two acceptable formats. Pick whichever fits the translator's workflow:

**Option A — JSON file.** The engineer has pre-scaffolded keys in `src/i18n/en.json` (English source) and `src/i18n/hi.json` (empty string values waiting for Hindi). The translator can fill in the Hindi values directly. This commit only pre-scaffolds the homepage hero block as proof-of-pattern — the rest will be scaffolded once the translator confirms the format works.

**Option B — Two-column spreadsheet.** The inventory below can be exported to a Google Sheet with columns `Key | English | Hindi | Translator notes`. The engineer transcribes the translator's column 3 back into the JSON files.

Either way, the engineer is responsible for migrating the marketing-page JSX to read from `t(locale, key)` once the Hindi values are in place. The translator's job is only to provide the Hindi text.

## Acceptance checklist

A page is considered translation-complete when:

- [ ] Every key listed for that page in the inventory below has a non-empty Hindi value
- [ ] A second native Hindi speaker has read the page in context (not just the strings) and confirmed register
- [ ] Legal citation accuracy spot-checked by IFF or SFLC.in (this is on the project lead, not the translator)
- [ ] `hi-review-status.json` is updated:
  - `status` → `REVIEWED_BY_NATIVE_SPEAKER`
  - `reviewedBy` → translator's name (or "anonymous reviewer N")
  - `reviewedAt` → ISO date
  - Note: the `scope` field should be updated to reflect which pages are now production-ready

---

## Page 1 — Homepage (`src/app/(public)/page.tsx`)

Pre-scaffolded into JSON. Translator fills `src/i18n/hi.json` values for these keys (English version is in `src/i18n/en.json`):

| Key | English text | Hindi (fill here) |
|---|---|---|
| `home.pill` | `Asmita · अस्मिता · for women in India` | _(keep as-is — bilingual wordmark)_ |
| `home.langNote` | `Available in English and हिंदी` | _(translate "Available in" only)_ |
| `home.hero.title.1` | `You don't have to face this` | |
| `home.hero.title.2` | `alone` | |
| `home.hero.title.3` | `.` | _(keep punctuation as-is)_ |
| `home.hero.sub` | `Free, confidential, and built around your dignity.` | |
| `home.hero.cta` | `Start a case` | |
| `home.hero.minorLink` | `Under 18? Find help` | |
| `home.hero.noFetch` | `We never fetch, view, download, or store the content at any link you share.` | |
| `home.validation` | `What you're feeling is valid. None of this is your fault.` | |
| `home.blockA.title` | `Did you know Indian law requires platforms to act in 24 hours?` | |
| `home.blockA.body` | `Most people don't. Asmita turns that right into one calm flow - paste links, review notices, and watch responses come in.` | |
| `home.blockA.link` | `How notices route` | |
| `home.blockB.title.1` | `Privacy is the architecture,` | |
| `home.blockB.title.2` | `not the marketing.` | |
| `home.blockB.item1.bold` | `We never fetch your URLs.` | |
| `home.blockB.item1.rest` | `Servers only parse the domain string.` | |
| `home.blockB.item2.bold` | `We never store the media.` | |
| `home.blockB.item2.rest` | `Only the notice metadata is kept.` | |
| `home.blockB.item3.bold` | `We never share without you.` | |
| `home.blockB.item3.rest` | `No third party sees your case unless you route it there.` | |
| `home.blockB.link` | `Read the privacy promise` | |
| `home.closing.title` | `Begin when you are ready.` | |
| `home.closing.body` | `There is no clock running. You can start, stop, and come back.` | |
| `home.closing.cta1` | `Start a case` | |
| `home.closing.cta2` | `Read the FAQ` | |
| `home.closing.partners` | `Notice templates reviewed by Internet Freedom Foundation and SFLC.in.` | _(keep partner names in English)_ |

## Page 2 — Start (`src/app/start/page.tsx`)

Not yet pre-scaffolded. Use Option B (spreadsheet) for now. The translator should read the file directly from the GitHub repository and provide a key/value list. The engineer will scaffold the JSON keys once the format is confirmed.

## Pages 3–8

Same approach as Page 2 until Page 1's JSON pattern is confirmed working with the translator. Once the homepage round-trips successfully (translator fills → engineer migrates JSX → page renders correctly in both locales), the engineer will scaffold the remaining pages in one batch and the translator continues filling.

---

## How to verify after filling

Once the homepage Hindi values are in `hi.json`, the engineer must:

1. Wrap each English string in the JSX with `t(locale, "home.hero.title.1")` etc.
2. Confirm the page renders in both `EN` and `हिंदी` via the language toggle at the top right.
3. Take screenshots in both locales and attach to the PR for the translator to spot-check in context.
4. Update `src/i18n/hi-review-status.json`:
   ```json
   {
     "status": "REVIEWED_BY_NATIVE_SPEAKER",
     "reviewedBy": "<name>",
     "reviewedAt": "<ISO date>",
     "scope": "<add 'homepage marketing copy' to the existing scope statement>",
     ...
   }
   ```

## Contact

Project lead: see PRD. Translation questions, register clarifications, or "is this term acceptable" lookups go to the project lead, not directly into translations.
