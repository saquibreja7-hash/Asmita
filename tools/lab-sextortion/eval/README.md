# The hand-written evaluation set (WP116)

This directory holds the classifier's evaluation set. It is **written by
hand, separately from the generator**, by WP116, styled on the documented
Indian sextortion patterns (`asmita/docs/research/2026-11-sources.md` §D)
but entirely invented: no real person, message, number or account appears
here. Rows are JSONL, one per line:

```json
{"id":"et-001","kind":"threat","family":"videoCallDeadline","script":"devanagari","labels":["DEMAND_MONEY","DEADLINE","CLAIM_HAS_MEDIA"],"text":"…"}
```

- `kind`: "threat" (any row carrying a label other than NOT_THREAT —
  including victim pleas, which are the victim's own message, not a threat
  to them) or "negative" (harmless hard-negative text).
- `script`: devanagari / romanised / mixed / english — every half of the set
  contains all four, because the WP117 evaluation reports per-script
  precision and recall to expose script bias (Sap et al., ACL 2019).
- `labels`: multi-label, in the canonical order of
  `asmita/src/lib/lab/sextortion/taxonomy.ts`.
- `family`: the documented pattern or hard-negative family the row belongs
  to.

Current size: 133 threats (≥ 120 required) and 194 negatives (≥ 180
required), 327 rows (≥ 300 required), covering every documented §D pattern
and every taxonomy label at least once.

## Never used for training or tuning

This set is **never** used for training, early stopping or threshold tuning
of the final model. WP117's trainer reads only generated data (a tuning
split of it); this directory is reserved for final evaluation. The
validator enforces the separation structurally: no eval text may appear in
the generated data, and eval ids (`et-`, `en-`) never collide with
generated ids (`g-`).

## The vocabulary snapshot is the review gate

`vocabulary.json` is the sorted list of every token in this set. When you
change any text here, `npm run validate` fails until you run
`npm run snapshot` — and the snapshot diff is the review: every added or
removed word is visible. Nothing that is a slur, explicit, a real name, a
real number or a real address may be accepted into that list.

## Who should replace this later

These are machine-written examples (drafted carefully by the WP116 author,
but machine-written all the same). They should be replaced by
**human-reviewed examples**: Asmita's content reviewers or counsellors who
have handled real sextortion cases, working under the owner's supervision,
should rewrite or replace rows with examples drawn from redacted,
consented material or freshly written realistic samples — labelling each
row together (two reviewers per row, disagreements resolved by a third).
Until then, the numbers in `asmita/docs/lab/sextortion-eval.md` (WP117)
describe a model evaluated on machine-written examples and must say so in
plain words.
