# ADR 001: Submitted URLs Are Never Fetched

See also ADR 006 (`006-hash-matching-crawler.md`): a narrow exception for the separate `crawler/` service only; this ADR still applies in full to the `asmita/` app.

Status: accepted

Asmita treats submitted URLs only as text tokens for domain extraction, platform routing, notice generation, deduplication, and audit evidence. The application must never open, preview, download, render, proxy, or server-fetch content from a submitted URL.

Enforcement:

- `eslint.config.mjs` blocks `fetch(submittedUrl)`, `fetch(url)`, `fetch(contentUrl)`, `fetch(urlString)`, and matching `axios` calls.
- URL parsing uses the platform `URL` parser locally.
- Tests cover parser behavior and the lint fixture.

Human reviewers should reject any feature proposal that requires server-side URL fetching in Phase 1.
