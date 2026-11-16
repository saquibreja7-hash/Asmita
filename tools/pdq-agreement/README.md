# pdq-agreement

Measures whether a Node pipeline (sharp + `asmita/src/lib/pdq/pdq.ts`) produces the same PDQ fingerprint as the survivor's browser (`hashImageFile` in `SubmitForm.tsx`, run in headless Chromium via Playwright). It uses synthetic, non-intimate fixtures generated on the fly (`src/fixtures.ts`); nothing is downloaded.

## Run

```
(cd ../../crawler && npm ci)      # the recipe resolves sharp from crawler/
npm install
npx playwright install chromium   # once
npm run report                    # regenerates REPORT.md (and out/results.json, gitignored)
npm test                          # unit tests for the recipe
```

## Reading the result

- The verdict in `REPORT.md` uses only the Node-vs-browser Hamming distance for the SAME file (node-prepared pipeline): max, p99, p95, mean, exact matches.
- GO means every image class that matters agrees within 10 bits. Classes above 10 are listed as exceptions with a recommendation.
- "PDQ robustness" (original vs cropped/recompressed copy) is PDQ's own behaviour, identical in both pipelines, and does not affect the verdict.
- The recipe measured is the crawler's own module, `crawler/src/prepare.ts`, imported by `src/prepare.ts` (no copy, so the two cannot drift). Run `npm ci` in `crawler/` before running this harness. Caveats are at the end of `REPORT.md`.
