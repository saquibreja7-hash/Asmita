# WP116: the sextortion message taxonomy

Owner-approved spec: `asmita/docs/research/research-tools-spec.md` (Track D).
Sources: `asmita/docs/research/2026-11-sources.md` §D.
Code: `asmita/src/lib/lab/sextortion/taxonomy.ts`, `lexicon.ts`, `normalise.ts`.
Data tools: `tools/lab-sextortion/` (generator and hand-written evaluation set).

This document is the human-readable taxonomy for the Indian sextortion message
classifier. The classifier (WP117) learns one-vs-rest logistic regressions
over these labels from synthetic training data, and the message-check page
shows what fired as plain sentences, never as scores or verdicts.

Everything in this area of the Lab follows the charter
(`asmita/docs/lab/charter.md`): text in memory only, nothing stored or
logged, no sexual content generated, invented examples only. The
complaint-workflow rules in the root CLAUDE.md do not apply here; the Lab
charter does.

## Why a taxonomy

The documented Indian modus operandi (police and news sources, 2021–2026,
listed in the sources file) is a sequence: a fake "profile" makes contact on
WhatsApp, a video call is screen-recorded (6–10 seconds is enough), the
threat follows — send to family, contacts or make it viral on social media —
with a deadline (24 hours, sometimes half an hour), payment demanded by UPI
or bank transfer in instalments, then repeated demands from new numbers, and
finally an impersonated authority ("Delhi Police crime branch", an "IPS
officer", CBI, the "thanedar") or a fake platform account ("YouTube
manager") demanding a "delete fee". Loan-app recovery agents use the same
shape with morphed photos sent to the contact list.

A single "is this sextortion?" bit cannot carry that structure. The labels
below describe what is actually in the message, and the stage inference maps
them onto the documented sequence only to choose advice.

## The 16 labels (multi-label)

A message usually carries several labels at once. Labels are never applied
to a person or a case — only to the pasted text.

| Label | Meaning | Documented shape it comes from |
|---|---|---|
| `THREAT_EXPOSE` | A threat to publish or send intimate or morphed media | "वीडियो सोशल मीडिया पर वायरल करने की धमकी" (patrika-2023-sirohi) |
| `AUDIENCE_FAMILY` | Family, relatives, contacts or a family/group chat named as the target | threat "to send recording to friends and family" (theprint-2022-mewat); family WhatsApp group (amarujala-2025-bhopal) |
| `AUDIENCE_PUBLIC` | Viral, social media, YouTube, "everyone" | "सोशल मीडिया पर वायरल कर दूंगा" (amarujala-2026-agra) |
| `DEMAND_MONEY` | Money demanded (amount, UPI, bank, instalments) | 24 h deadline and bank deposit (aljazeera-2022); "अलग-अलग किश्तों में" (patrika-2023-sirohi); PhonePe/GooglePay (theprint-2022-mewat) |
| `DEMAND_SEXUAL` | A demand to meet alone, send more images, or take a video call | "अकेले मिलने आओ, वीडियो डिलीट कर दूंगा" (amarujala-2025-bhopal) |
| `DEMAND_THIRD_PARTY` | Bring or introduce another person | "अपनी भाभी को मेरे पास लेकर आओ…" (amarujala-2026-agra) |
| `DEADLINE` | A countdown: 24 hours, half an hour, "by tonight" | 24 h (aljazeera-2022); half-hour deadlines (amarujala-2025-gorakhpur) |
| `AUTHORITY_IMPERSONATION` | Posing as police, crime branch, cyber cell, CBI, "thanedar", with FIR/arrest/"case band" | "थानेदार" (patrika-2023-sirohi); fake CBI officer (fpj-2023-cbi); Delhi Police cyber crime inspector (tribune-2025) |
| `PLATFORM_IMPERSONATION` | Posing as a platform team ("YouTube manager", "delete fee") | "यूट्यूब मैनेजर" (patrika-2023-sirohi); "YouTube employee" (tribune-2025); "to delete the video" (fpj-2023-cbi) |
| `LOAN_RECOVERY` | Loan/EMI/recovery agent pressure with morphing and contacts | loan-app morphed photos to contacts (quint-2025-loanapp, lokmat-loanapp, dh-loanapp) |
| `CLAIM_HAS_MEDIA` | Claims to have a recording, clip, photos, screenshots | 6–10 s recordings (aljazeera-2022); "proof" clip (aajtak-2025) |
| `MORPHING` | Media is said to be edited, AI-made or morphed | AI-morphed nudes from call screenshots; loan-app morphed pics (dh-loanapp) |
| `REPEAT_DEMAND` | Paid already, more demanded (often from a new number) | repeat control messages (amarujala-2025-gorakhpur) |
| `VICTIM_PLEA` | The pasted text is the victim's own message pleading | "भाई प्लीज, वीडियो वायरल मत करना" (amarujala-2025-gorakhpur) |
| `MINOR_SIGNAL` | Any indication someone under 18 is involved | age or school context only, e.g. "I am in class 9" (spec wording) |
| `NOT_THREAT` | Message-level: harmless text | hard negatives (family chat, notices, reminders, news, awareness copy) |

Label groups used downstream (`taxonomy.ts`): **core** = `THREAT_EXPOSE`,
`CLAIM_HAS_MEDIA` (what makes a message a likely threat); **supporting** =
the demand/audience/deadline/impersonation labels (the pressure the WP117
combination rule requires alongside a core label); **context** = `MORPHING`,
`VICTIM_PLEA`, `MINOR_SIGNAL`.

## Stage inference

`inferStage(labels)` maps labels onto the documented ladder
`contact → capture → threat → payment → repeat → impersonated authority` and
returns the **furthest rung any label evidences**, because advice for a
later rung subsumes earlier advice. The stage picks advice copy in WP117; it
is never shown as a verdict.

- capture: `DEMAND_SEXUAL`, `DEMAND_THIRD_PARTY`, `CLAIM_HAS_MEDIA`, `MORPHING`
  (media exists, is claimed, or is being sought — including from another person)
- threat: `THREAT_EXPOSE`, `AUDIENCE_FAMILY`, `AUDIENCE_PUBLIC`,
  `LOAN_RECOVERY`, `VICTIM_PLEA` (a plea presumes a live threat)
- payment: `DEMAND_MONEY`, `DEADLINE`
- repeat: `REPEAT_DEMAND`
- impersonated authority: `AUTHORITY_IMPERSONATION`, `PLATFORM_IMPERSONATION`

`inferStage` returns null when no label evidences any rung (no labels, only
`NOT_THREAT`, or only `MINOR_SIGNAL`): a stated age alone picks no advice,
because the minor pathway routes the person to `/minor-support` before
anything else (the WP93 rule, kept first in WP117). The `contact` rung is
never inferred: a bare approach message ("hi, friendship karegi?") carries no
label, and the page's fixed copy already covers it.

## Normalisation and the two script views

`normalise.ts` turns a pasted message into two feature views, deterministically:

1. `normalised` — NFC composition; zero-width and directional characters
   stripped (a documented filter-dodging trick); homoglyph look-alikes
   folded to ASCII (Cyrillic а/е/о/р/с/х, the fullwidth block, Devanagari
   digits); Latin lowercased; runs of three or more identical letters
   collapsed to two ("plzzz" → "plzz", "हुआआआ" stays Hindi-shaped); digits
   mapped to letters only inside words and only where unambiguous
   (0→o, 3→e, 4→a, 5→s — "p4ise" → "paise"; amounts, dates and
   98XXXXXX00-style placeholder numbers are never rewritten); whitespace
   squeezed.
2. `romanised` — the same text with every Devanagari character mapped
   through a small fixed ITRANS-like table (implicit "a", no schwa
   deletion, no machine learning, no external service). Latin words inside a
   Devanagari message pass through, so code-mixed messages keep both views.

Both views are kept because real messages arrive in Devanagari, romanised
Hinglish, English and every mixture of the three, and character n-grams over
the two views give the classifier (WP117) one feature space for all of them.

## Lexicon policy

`lexicon.ts` holds, per label, Devanagari terms, English terms and
romanised Hinglish variants with common spelling noise ("viral kar
dunga/doonga/denge", "ghar walon/gharwalon", "paise bhej/bhejo", "UPI kar",
"24 ghante", "video delete kar dunga", "thanedar", "FIR ho jayegi"). Terms
are matched as substrings against the normalised views (Devanagari terms in
the original-script view, latin terms in the latin views).

Source tags follow the sources file: Devanagari phrases the coverage quotes
carry the source id (`थानेदार` → patrika-2023-sirohi, `अकेले मिलने आओ` →
amarujala-2025-bhopal, `अपनी भाभी को मेरे पास लेकर आओ` → amarujala-2026-agra,
`वीडियो वायरल मत करना` → amarujala-2025-gorakhpur, `यूट्यूब मैनेजर` →
patrika-2023-sirohi). No verbatim romanised Hinglish exists in an
authoritative source, so **every romanised entry is tagged `derived`**: our
rendering, reviewable in the file. The sources file notes its quotes came
from a summarising fetch; a source tag means "pattern documented by this
coverage", not "verified verbatim", and nothing tagged with a source id is
shown to a user as a quote.

## Content rules for everything downstream

- No sexual content: the Lab generates no sexual material. The vocabulary is
  clinical (video, clip, recording, photo, obscene, objectionable — the words
  the sources themselves use) and mentions no acts or bodies.
- No slurs, no real names, no real phone numbers (98XXXXXX00-style
  placeholders only), no real abuse URLs, no survivor data. Fixtures are
  invented.
- Minors appear only as a stated age or school context ("I am in class 9"),
  never in a sexual context; a minor signal routes to the minor pathway.
- The training generator (`tools/lab-sextortion/`) is deterministic (seeded),
  its data is generated locally and never committed; the hand-written
  evaluation set is committed and documented in `tools/lab-sextortion/eval/`.

## Bias and honesty notes carried forward

- Dialect and script bias inflate false positives (Sap et al., ACL 2019):
  the evaluation set is broken down by script so WP117 must report
  per-script precision/recall, not just averages.
- A signal is not a verdict (Meta, July 2024): nothing here decides
  anything about a person; the message-check page says the check can be wrong.
- Non-blaming language (eSafety): advice copy never blames the person who
  received the message; "This is not your fault" is part of the page copy in
  WP117.
