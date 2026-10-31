# StopNCII.org — competitor research findings

Source: crawl of stopncii.org (2026-06-13) via context.dev. Raw pages were
in `research/` (throwaway, deleted). This is the distilled, durable summary.
StopNCII is built by **Meta + SWGfL** (UK charity); not government-affiliated.

## Their model in one line

Client-side hash → central **hash bank** → **partner platforms pull and match**.
No email, no account, no outbound notices. Fundamentally a *pull* model.

## The 6-step flow

1. User selects intimate image/video on device.
2. Hash generated **client-side** (PDQ/PhotoDNA for images, MD5 for video). Only
   the hash leaves the device; media never does.
3. User receives **case number + PIN** — no account, no required email. Optional
   system-generated email of the case number, then the address is discarded.
   Lost PIN/number = unrecoverable (they store nothing to recover from).
4. Participating platforms match the hash against uploads; remove matches that
   violate their own intimate-image policy.
5. Periodic re-scanning continues.
6. User checks status / withdraws (whole case only) via case number + PIN.

## Eligibility gates (their hard rules)

- Image is **of you** and you **have access** to it.
- Image is **intimate** (nude/sexual).
- You were **18+** in the image. Under-18 → routed to TakeItDown (NCMEC).
- **Cannot** submit on behalf of someone else.
- Available worldwide.

## Consent / abuse-prevention posture

- reCAPTCHA-gated, multi-step JS wizard (bot-resistant — crawler couldn't pass).
- Zero-PII by design is itself the abuse mitigation: minimal data, no account.
- Honest, explicit limitations stated up front (see below).

## Technical details worth noting

- Algorithms: **PDQ + PhotoDNA** (images), **MD5** (video). Open-source/industry standard.
- **Max 20 hashes per case**; cannot add to a case later (start a new one).
- Accepted formats: jpeg/jpg/png/gif/psd/tiff/xcf/tga/miff/ico/dcm/xpm/pcx/bmp + mp4/mov/avi/qt/wmv.
- Exact-match only: crop/filter/clip defeats the hash (must re-hash edited versions).
- Screenshots accepted if borders removed without cropping the image.
- Covers deepfakes/synthetic if of you and nude/semi-nude.
- Does NOT work on encrypted/messaging platforms or the whole internet — only partners.

## Partner platforms (the entire value of the network)

Microsoft (Bing + GroupMe/Teams Free/OneDrive/Xbox), OnlyFans, Pornhub,
Playhouse, RedGifs, Vivastreet, F2F, FetLife. ~8 industry partners doing
proactive matching.

## What Asmita should take from this

**Validates our architecture choice.** StopNCII's power is the pull-based hash
bank + pre-integrated partners — which needs partnerships we are not pursuing.
Asmita Phase 2 instead **pushes** a legal notice + hash by email to verified
grievance contacts. Trade-off is explicit:

| | StopNCII | Asmita Phase 2 |
|---|---|---|
| Distribution | Platforms pull from hash bank | We email hash + legal notice |
| Reach | ~8 partners | Any platform with a grievance contact |
| Leverage | Voluntary policy match | IT Rules 2021 legal weight |
| PII | Zero (PIN model) | Email account (OTP) |

**Concrete things to adopt:**
1. **Plain-language hashing copy** — "a digital fingerprint, like a barcode; the
   image never leaves your device." Trauma-informed, clear. Model our Phase 2 copy on it.
2. **Honest limitations framing** in the UI — be upfront that we reach only
   platforms with contacts, not encrypted apps or the whole internet
   (our `docs/archive/planning-2026-05/ncii-india-system-design.md` already flags this).
3. **Eligibility gate copy** maps almost 1:1 to our adult-only + "image is of you"
   posture — reuse their wording where it fits the Indian context.
4. **20-hash cap + exact-match limitation warning** — sensible UX guards to mirror.

**Deliberately NOT adopting:** the PIN-only/no-account model. Asmita's notice
pipeline (tracking, escalation, FIR package) needs an account; that's the
considered trade-off, not an oversight.

## The "Create Your Case" eligibility wizard (10 steps, captured manually)

The intake is a **progressive eligibility-gating wizard** — its real job is to
route ineligible/unsafe users OUT before any hashing happens. This is their
primary abuse-prevention mechanism. Flow:

**Agree screen** — states up front: "StopNCII only accepts Non-Consensual
Intimate Images and Videos, ineligible media will not be removed." Lists:
- *Eligibility*: you are depicted; image shows you nude/semi-nude or a sexual act; you were 18+.
- *We Accept*: nude/semi-nude/sexual images you don't consent to be published; synthetic/fake/generated intimate images.
- *We CANNOT Accept*: commercial/professional images; the ORIGINAL image used to make a deepfake; test images; screenshots of text conversations; audio recordings.

**Step 1 — Age:** "What is your age in the image(s)/video(s)?" → *Under 18* | *18 or over*.
- Under 18 → **hard stop**: "we cannot help… contact NCMEC or Internet Watch Foundation… outside UK, visit this page." (routes to child-safety orgs)

**Step 2 — Who is in it:** → *Myself* | *Me and someone I know* | *Someone else*.
- Someone else → **hard stop**: "You do not qualify… if you know the person, ask them to use this service directly. If already shared online, report directly on the platform (reporting guide)."

**Step 3 — Setting:** "public place" | "private place".
**Step 4 — Clothing:** "nude or semi nude" | "fully clothed".
- public + fully clothed → **hard stop** "You do not qualify." (i.e. content must be intimate)

**Step 5 — Sexual act:** "I am engaging in a sexual act" → Yes | No.
**Step 6 — Already shared:** "Have any of your image(s)/video(s) already been
shared online?" → *Yes* | *No* | *I don't know*. Then a panel: if already shared,
fastest help may be reporting directly on the platform (reporting guide) → Next.
  - **KEY: "No" is fully supported** — this is the *preemptive/sextortion* path.
    The tool protects against content that has NOT yet been leaked but is
    threatened. Both reactive (already leaked) and preventive flows are first-class.

**Step 7 — Select content:** "Image(s)/video(s) do NOT leave your device" banner.
"Select Photos/Videos" — hashed locally, hash shared with participating companies.
Up to 20 per case.

**Steps 8–10:** hashing → case number + PIN generation → optional emailed case number.

### What Asmita must adopt from this wizard

1. **Progressive eligibility gating with explicit OFF-RAMPS.** Don't just collect
   a declaration checkbox — actively branch users to the right help:
   - under-18 → POCSO/CHILDLINE 1098 routing (we already do this)
   - "someone else" → tell them only the depicted person can file; point to
     platform reporting
   - non-intimate / fully-clothed-public → "this isn't the right tool" exit
2. **The "already shared online?" question is essential** and Asmita's Phase 2
   should ask it: it forks reactive (URL takedown — Phase 1) vs preventive
   (hash dispatch before leak — Phase 2). Saquib's emphasis: the preemptive
   path (threatened but not yet leaked = sextortion) is a core use case, already
   noted as first-class in `docs/archive/planning-2026-05/ncii-india-system-design.md` §8.
3. **Honest "we cannot accept" list** shown before intake sets expectations and
   reduces junk submissions / abuse.
4. **"Does not leave your device" reassurance** repeated at the actual file-select
   step, not just in marketing copy.

## Visual capture notes (screenshots, 2026-06-13)

- **How It Works** and **Check Case Status** captured full-page successfully.
- **Check Case Status** is just two fields: *Case Number* + *Password (PIN)* →
  "Search Case". Visual confirmation of the zero-PII model — no email lookup.
- **Create Your Case** could NOT be captured by markdown scrape OR screenshot:
  the wizard is reCAPTCHA-gated and only renders after a human challenge. Their
  intake is deliberately bot-resistant. Takeaway for us: if we ever expose a
  public hash-intake form, reCAPTCHA/Turnstile on it is industry-standard here.
