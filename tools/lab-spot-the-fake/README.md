# lab-spot-the-fake

Generates the placeholder image set for the "Spot the fake" quiz
(`/lab/spot-the-fake`, WP95 of `asmita/docs/lab/beta-spec.md`).

Every image is a synthetic flat vector scene drawn by `generate.cjs` — no
photograph, no real person, no third-party rights. The set is a placeholder:
**the owner must supply the final curated set** and record each image's
licence in the `source` field of `quiz.json`. Each "AI-made" round carries
one real, findable tell (garbled sign text, an extra finger, a shadow that
disagrees with the light, warped background lines, mismatched earrings,
waxy skin) so the quiz teaches honestly even before real photos arrive.

Output, into `asmita/public/lab/spot-the-fake/`:

- `NN-*.webp` — ten scenes, each under the spec's 150 KB cap
- `quiz.json` — the manifest: per round `file`, `answer` (`real`/`ai`),
  `scene` and `tell` in English and Hindi, and `source`/licence

The manifest is validated on the app side by
`asmita/src/lib/lab/spot-the-fake/quiz.ts` (the same schema the page uses
before rendering anything from it) and covered by
`asmita/tests/unit/lab-spot-the-fake.test.ts`.

## Run

```sh
npm install        # sharp only
npm run generate
```

On a machine where `asmita/node_modules` is already installed, the same
sharp can be borrowed without a separate install:

```sh
NODE_PATH=../../asmita/node_modules node generate.cjs
```
