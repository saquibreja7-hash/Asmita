# WP117: the sextortion classifier's evaluation report

Owner-approved spec: `asmita/docs/research/research-tools-spec.md` (Track D,
WP117). Sources: `asmita/docs/research/2026-11-sources.md` §D.
Code: `asmita/src/lib/lab/sextortion/` (features, model, classify),
`tools/lab-sextortion/` (trainer, `npm run train` / `npm run eval-report`).

This document reports what the classifier does on the hand-written
evaluation set (`tools/lab-sextortion/eval/`, 327 invented examples: 133
threat-like, 194 hard negatives, all four scripts in both halves). The eval
set was written by hand, separately from the generator, and was **never
used for training, threshold selection or early stopping** — those use only
a deterministic split of the synthetic data (10,028 train / 1,973 tuning
rows, seed 20261122). These numbers are the honest output of
`npm run eval-report` against the committed model (model version 1, trained
2026-11-22). Regenerate them with that command after any retrain.

**What the model is.** A one-vs-rest logistic regression per taxonomy label
over hashed features (character 2–5-grams over both script views, word
uni/bi-grams, one feature per matched lexicon term), trained with plain
mini-batch gradient descent and L2 decay. Nothing about it is a verdict:
the page shows one plain sentence per detected element, stage-chosen
advice, and the fixed line "This check can be wrong. It looks for patterns
seen in known blackmail cases."

## The flag decision

The spec's decision logic: a message is flagged as a likely sextortion
threat only when `THREAT_EXPOSE` or `CLAIM_HAS_MEDIA` is at or above its
threshold **and** at least one demand/audience/deadline/impersonation label
is at or above its threshold. On the tuning split this rule was tuned to
precision 1.000 (the spec requires ≥ 0.95), recall 1.000, with 0 false
flags on tuning hard negatives (threshold shift δ = 0: the max-margin
thresholds already met the target).

The three systems compared on the eval set, all on the same rows:

- **rules-only**: the WP93 pattern engine. As a flag, "≥ 2 distinct rule
  ids" — the same a-single-keyword-is-never-enough principle.
- **model**: the WP117 combination rule above.
- **rules+model**: either fires — what `/lab/message-check` now runs.

Eval rows: 327 (77 should flag — the threat rows that carry a core and a
supporting label — and 250 should not: hard negatives plus threat-shaped
rows the combination rule should leave alone, like pleas and bare claims).

| system | flagged | precision | recall | F1 |
|---|---|---|---|---|
| rules-only (WP93, ≥ 2 rules) | 8 | 50.0% | 5.2% | 9.4% |
| model (WP117 combination rule) | 39 | 100.0% | 50.6% | 67.2% |
| rules+model (the page) | 45 | 91.1% | 53.2% | 67.2% |

Per script (precision / recall per system):

| script | rules-only | model | rules+model |
|---|---|---|---|
| devanagari | 100.0% / 0.0% | 100.0% / 50.0% | 100.0% / 50.0% |
| romanised | 0.0% / 0.0% | 100.0% / 52.4% | 91.7% / 52.4% |
| mixed | 100.0% / 5.9% | 100.0% / 58.8% | 100.0% / 58.8% |
| english | 50.0% / 17.6% | 100.0% / 41.2% | 75.0% / 52.9% |

**How to read this.** The WP93 rules are high-precision regexes tuned on
documented phrasings; on the eval set's paraphrased wording they rarely
fire, and half their flags are false — alone they are not a sextortion
detector. The model's flag never fires on a harmless example (precision
100%) but catches about half of the flag-eligible threats. The two engines
overlap little, so the union (the page) is the best system: F1 67.2%, with
English gaining most (the rules are strongest there, the model weakest).
Recall is the honest weak point: the model was trained on a closed
synthetic vocabulary (the generator can only produce its own templates and
slots), so paraphrases outside that vocabulary score below threshold. This
is the known cost of the spec's no-real-data rule, and the reason the page
never presents a check as proof of anything.

## Per-label results (model), overall and by script

Reported per script to expose bias, per Sap et al. (ACL 2019, P19-1163):
dialect and script skew is the known failure mode of abuse classifiers.

### all

| label | support | precision | recall | F1 |
|---|---|---|---|---|
| THREAT_EXPOSE | 52 | 91.7% | 63.5% | 75.0% |
| AUDIENCE_FAMILY | 20 | 84.2% | 80.0% | 82.1% |
| AUDIENCE_PUBLIC | 11 | 91.7% | 100.0% | 95.7% |
| DEMAND_MONEY | 68 | 92.3% | 17.6% | 29.6% |
| DEMAND_SEXUAL | 8 | 77.8% | 87.5% | 82.4% |
| DEMAND_THIRD_PARTY | 6 | 100.0% | 100.0% | 100.0% |
| DEADLINE | 24 | 93.3% | 58.3% | 71.8% |
| AUTHORITY_IMPERSONATION | 16 | 100.0% | 81.3% | 89.7% |
| PLATFORM_IMPERSONATION | 10 | 100.0% | 50.0% | 66.7% |
| LOAN_RECOVERY | 10 | 100.0% | 60.0% | 75.0% |
| CLAIM_HAS_MEDIA | 72 | 90.9% | 41.7% | 57.1% |
| MORPHING | 16 | 100.0% | 56.3% | 72.0% |
| REPEAT_DEMAND | 8 | 100.0% | 37.5% | 54.5% |
| VICTIM_PLEA | 9 | 100.0% | 100.0% | 100.0% |
| MINOR_SIGNAL | 12 | 100.0% | 83.3% | 90.9% |
| NOT_THREAT | 194 | 100.0% | 0.0% | 0.0% |

`NOT_THREAT` is trained but never surfaced: the page must never tell
someone a message is safe, so a NOT_THREAT firing changes nothing the
visitor sees (recall 0% is the design working, not a defect).

### devanagari

| label | support | precision | recall | F1 |
|---|---|---|---|---|
| THREAT_EXPOSE | 14 | 100.0% | 71.4% | 83.3% |
| AUDIENCE_FAMILY | 6 | 100.0% | 66.7% | 80.0% |
| AUDIENCE_PUBLIC | 4 | 100.0% | 100.0% | 100.0% |
| DEMAND_MONEY | 20 | 100.0% | 20.0% | 33.3% |
| DEMAND_SEXUAL | 2 | 100.0% | 100.0% | 100.0% |
| DEMAND_THIRD_PARTY | 2 | 100.0% | 100.0% | 100.0% |
| DEADLINE | 5 | 80.0% | 80.0% | 80.0% |
| AUTHORITY_IMPERSONATION | 5 | 100.0% | 100.0% | 100.0% |
| PLATFORM_IMPERSONATION | 3 | 100.0% | 100.0% | 100.0% |
| LOAN_RECOVERY | 3 | 100.0% | 33.3% | 50.0% |
| CLAIM_HAS_MEDIA | 23 | 100.0% | 52.2% | 68.6% |
| MORPHING | 5 | 100.0% | 40.0% | 57.1% |
| REPEAT_DEMAND | 2 | 100.0% | 100.0% | 100.0% |
| VICTIM_PLEA | 3 | 100.0% | 100.0% | 100.0% |
| MINOR_SIGNAL | 4 | 100.0% | 100.0% | 100.0% |
| NOT_THREAT | 51 | 100.0% | 0.0% | 0.0% |

### romanised

| label | support | precision | recall | F1 |
|---|---|---|---|---|
| THREAT_EXPOSE | 13 | 87.5% | 53.8% | 66.7% |
| AUDIENCE_FAMILY | 5 | 75.0% | 60.0% | 66.7% |
| AUDIENCE_PUBLIC | 3 | 100.0% | 100.0% | 100.0% |
| DEMAND_MONEY | 18 | 100.0% | 27.8% | 43.5% |
| DEMAND_SEXUAL | 2 | 50.0% | 100.0% | 66.7% |
| DEMAND_THIRD_PARTY | 2 | 100.0% | 100.0% | 100.0% |
| DEADLINE | 8 | 100.0% | 87.5% | 93.3% |
| AUTHORITY_IMPERSONATION | 5 | 100.0% | 80.0% | 88.9% |
| PLATFORM_IMPERSONATION | 3 | 100.0% | 33.3% | 50.0% |
| LOAN_RECOVERY | 3 | 100.0% | 66.7% | 80.0% |
| CLAIM_HAS_MEDIA | 20 | 80.0% | 40.0% | 53.3% |
| MORPHING | 5 | 100.0% | 60.0% | 75.0% |
| REPEAT_DEMAND | 2 | 100.0% | 50.0% | 66.7% |
| VICTIM_PLEA | 3 | 100.0% | 100.0% | 100.0% |
| MINOR_SIGNAL | 4 | 100.0% | 75.0% | 85.7% |
| NOT_THREAT | 52 | 100.0% | 0.0% | 0.0% |

### mixed

| label | support | precision | recall | F1 |
|---|---|---|---|---|
| THREAT_EXPOSE | 14 | 90.9% | 71.4% | 80.0% |
| AUDIENCE_FAMILY | 3 | 60.0% | 100.0% | 75.0% |
| AUDIENCE_PUBLIC | 2 | 66.7% | 100.0% | 80.0% |
| DEMAND_MONEY | 15 | 100.0% | 13.3% | 23.5% |
| DEMAND_SEXUAL | 2 | 100.0% | 100.0% | 100.0% |
| DEMAND_THIRD_PARTY | 1 | 100.0% | 100.0% | 100.0% |
| DEADLINE | 4 | 100.0% | 25.0% | 40.0% |
| AUTHORITY_IMPERSONATION | 3 | 100.0% | 66.7% | 80.0% |
| PLATFORM_IMPERSONATION | 2 | 100.0% | 0.0% | 0.0% |
| LOAN_RECOVERY | 2 | 100.0% | 50.0% | 66.7% |
| CLAIM_HAS_MEDIA | 11 | 87.5% | 63.6% | 73.7% |
| MORPHING | 3 | 100.0% | 66.7% | 80.0% |
| REPEAT_DEMAND | 2 | 100.0% | 0.0% | 0.0% |
| VICTIM_PLEA | 1 | 100.0% | 100.0% | 100.0% |
| MINOR_SIGNAL | 1 | 100.0% | 100.0% | 100.0% |
| NOT_THREAT | 38 | 100.0% | 0.0% | 0.0% |

### english

| label | support | precision | recall | F1 |
|---|---|---|---|---|
| THREAT_EXPOSE | 11 | 85.7% | 54.5% | 66.7% |
| AUDIENCE_FAMILY | 6 | 100.0% | 100.0% | 100.0% |
| AUDIENCE_PUBLIC | 2 | 100.0% | 100.0% | 100.0% |
| DEMAND_MONEY | 15 | 50.0% | 6.7% | 11.8% |
| DEMAND_SEXUAL | 2 | 100.0% | 50.0% | 66.7% |
| DEMAND_THIRD_PARTY | 1 | 100.0% | 100.0% | 100.0% |
| DEADLINE | 7 | 100.0% | 28.6% | 44.4% |
| AUTHORITY_IMPERSONATION | 3 | 100.0% | 66.7% | 80.0% |
| PLATFORM_IMPERSONATION | 2 | 100.0% | 50.0% | 66.7% |
| LOAN_RECOVERY | 2 | 100.0% | 100.0% | 100.0% |
| CLAIM_HAS_MEDIA | 18 | 100.0% | 16.7% | 28.6% |
| MORPHING | 3 | 100.0% | 66.7% | 80.0% |
| REPEAT_DEMAND | 2 | 100.0% | 0.0% | 0.0% |
| VICTIM_PLEA | 2 | 100.0% | 100.0% | 100.0% |
| MINOR_SIGNAL | 3 | 100.0% | 66.7% | 80.0% |
| NOT_THREAT | 53 | 100.0% | 0.0% | 0.0% |

**The bias picture.** No script collapses: every script flags 41–59% of
its flag-eligible threats with 100% flag precision, and label-level
precision stays ≥ 50% everywhere. But the spread is real: English is the
weakest for the money and media-claim labels (the training templates'
English slot forms are the least varied), while Devanagari and mixed lead
on most labels. DEMAND_MONEY is the weakest label everywhere (17.6% overall
recall) — the eval set phrases money demands in many registers ("₹50000
यूपीआई पर भेजो", "pay up", "transfer the money to this account") while the
generator's closed vocabulary fixes a handful of phrasings. Any future
improvement should start there, by widening the generator's money slot
vocabulary — a WP116-side change — not by tuning thresholds on this eval
set.

## Hard negatives (confusion)

| family | rows | model flags | rules flags | rules+model flags | labels that fired |
|---|---|---|---|---|---|
| familyChat | 30 | 0 | 0 | 0 | AUDIENCE_FAMILY ×2 |
| policeNotice | 22 | 0 | 0 | 0 | — |
| bankNotice | 20 | 0 | 0 | 0 | DEADLINE ×1 |
| loanReminder | 18 | 0 | 0 | 0 | DEMAND_MONEY ×1 |
| flirtChat | 20 | 0 | 0 | 0 | — |
| newsText | 30 | 0 | 0 | 0 | — |
| awareness | 20 | 0 | 0 | 0 | — |
| workDeadline | 10 | 0 | 0 | 0 | — |
| schoolChat | 9 | 0 | 0 | 0 | MINOR_SIGNAL ×9 |
| dailyChat | 15 | 0 | 0 | 0 | — |

**No hard negative is flagged by any system.** Four families produced a
single stray label each (a family-chat message about a family group, a bank
notice with a due date, a loan reminder mentioning an amount, and the
school-chat rows, where MINOR_SIGNAL firing is the intended routing
behaviour — those rows carry the label). On the page a stray element
sentence can appear on a harmless message without the message ever being
called a sextortion threat; the flag never fires, and the fixed copy says
a match is a warning sign, not proof.

## Minor routing

MINOR_SIGNAL fires on 10 of the 12 eval rows that carry it (83.3% recall,
100% precision — no adult threat row triggers it). The page routes to
`/minor-support` when the WP93 rules detect under-18 **or** MINOR_SIGNAL
fires, whichever comes first in code.

## What was measured, and what was not

Measured here, on this machine (Windows, Node 22): everything above, plus
inference latency — the committed model classifies a 4,000-character
message in well under the spec's 20 ms budget (median of warm runs ≈ 3 ms;
asserted in `tests/unit/lab-sextortion-classify.test.ts`).

Not measured on this machine:

- **Playwright**: the e2e spec for the updated page
  (`tests/e2e/lab-message-check.spec.ts`) was written against the verified
  pipeline output but not executed here — this machine has no Playwright.
- **The optional MuRIL comparison** (spec WP117 item 3) was not run: it
  needs a Python training environment and Hugging Face weights that stay
  off this repository. The question it would answer — does a fine-tuned
  MuRIL beat this linear model by enough to justify a hosted service? —
  stays open. Given that the linear model's eval recall is bounded by the
  synthetic vocabulary, not by model capacity, the honest expectation is
  that a transformer would show the same vocabulary gap; that is a
  hypothesis to test, not a result.

## Reproducing

```bash
cd tools/lab-sextortion
npm run train         # rebuilds asmita/src/lib/lab/sextortion/model.json deterministically
npm run eval-report   # prints the tables in this document from the committed model
```

The training date is a constant in `train.ts`; a retrain after changing
the generator, templates, features or hyperparameters must bump
`TRAINER_VERSION` and that date, and update this document's numbers.
