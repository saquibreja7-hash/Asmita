# pdq-agreement

Measures whether a Node pipeline (sharp + `asmita/src/lib/pdq/pdq.ts`) produces the same PDQ fingerprint as the survivor's browser (`hashImageFile` in `SubmitForm.tsx`, run in headless Chromium via Playwright). It uses synthetic, non-intimate fixtures generated on the fly (`src/fixtures.ts`); nothing is downloaded.

## Run

```
npm install
npx playwright install chromium   # once
npm run report                    # regenerates REPORT.md (and out/results.json, gitignored)
npm test                          # unit tests for src/prepare.ts
```

## Reading the result

- The verdict in `REPORT.md` uses only the Node-vs-browser Hamming distance for the SAME file (node-prepared pipeline): max, p99, p95, mean, exact matches.
- GO means every image class that matters agrees within 10 bits. Classes above 10 are listed as exceptions with a recommendation.
- "PDQ robustness" (original vs cropped/recompressed copy) is PDQ's own behaviour, identical in both pipelines, and does not affect the verdict.
- `src/prepare.ts` (`prepareForPdq`) is the recipe the crawler should copy. Caveats are at the end of `REPORT.md`.
