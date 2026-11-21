# lab-sextortion (WP116)

The taxonomy, lexicon and synthetic-data tooling for the Indian sextortion
message classifier. Spec: `asmita/docs/research/research-tools-spec.md`
(Track D, WP116). Taxonomy documentation:
`asmita/docs/lab/sextortion-taxonomy.md`.

What lives where:

- `src/` — the deterministic generator, its slot pools and template
  families (`slots.ts`, `templates.ts`, `generate.ts`, `noise.ts`,
  `rng.ts`), dataset I/O and validators (`dataset.ts`, `validate.ts`,
  `evalSet.ts`, `cli.ts`). The generator imports the taxonomy from
  `asmita/src/lib/lab/sextortion/` (the same code the classifier runs).
- `eval/` — the committed, hand-written evaluation set (see `eval/README.md`).
- `tests/` — the vitest suite for all of the above.
- `data/` — the generated training data (gitignored, never committed: this
  is a public repository). It is rebuilt deterministically from the fixed
  seed 20261122 (the spec's owner-approval date), so nothing is lost by
  keeping it out of git.

Commands:

```bash
npm ci
npm run generate    # write data/generated.jsonl + data/manifest.json
npm run validate     # full validation of generated data and the eval set
npm run snapshot     # regenerate eval/vocabulary.json (review the diff!)
npm run stats        # print dataset counts
npm run check        # type-check + tests + validate
```

## How the generator works

Families (`templates.ts`) fix the shape of a message and its quota:
12 threat families (6,000 rows) and 9 hard-negative families (6,000 rows),
each split across four scripts — Devanagari, romanised Hinglish, mixed and
English — as evenly as possible. A frame's `{slot}` markers are filled from
`slots.ts` in the row's script form; `{slot?}` is optional and contributes
no label when skipped, so labels always describe what is in the text.
Mixed script reuses the romanised frames and flips each slot to Devanagari
half the time. About 40% of rows then take one or two character-level noise
operators (typos, letter runs, digit-as-letter, missing spaces,
zero-width characters) that mirror how these messages are actually typed —
and which `asmita/src/lib/lab/sextortion/normalise.ts` is built to undo.
MINOR_SIGNAL rows are never noised: the age or school statement must stay
recognisable, because minor routing is rule-based and runs first.

The generator is a **closed vocabulary**: every token comes from the
committed templates and slot pools. No slur, real name or real number can
appear in generated text, because there is nowhere for it to come from —
`validate.ts` re-derives the vocabulary and asserts exactly that, plus the
spec's minimums (6,000 + 6,000, script balance, quota exactness, label
coherence, no phone-like digit runs, no unexpected addresses).

## Content rules (public repo)

Everything here is invented. No sexual content (clinical media vocabulary
only), no slurs, no real names, numbers only as 98XXXXXX00-style
placeholders, synthetic UPI handles (`test@upi`), and the only URL in the
evaluation set is the helpline address the site itself publishes
(cybercrime.gov.in). Minors appear only as stated age or school context.
The hand-written evaluation set keeps a reviewed token snapshot
(`eval/vocabulary.json`) so every word that enters it is seen by a human.

## Licences

No third-party code, data or weights are used or copied in this package:
the generator, templates, slots and evaluation examples are Asmita's own
work, and no research dataset (HASOC, TRAC, MACD and the like are
research-only or unlicensed) is used for training or evaluation. The
documented patterns it is modelled on are cited in
`asmita/docs/research/2026-11-sources.md` §D; no dataset licence is needed
for that. If that ever changes, a THIRD_PARTY.md will appear here.
