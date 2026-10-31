# Reporting workflow verification — 31 October 2026

## Verdict

Local intake and case management pass the exercised checks. Live end-to-end notice delivery remains unverified. This is not a production-readiness approval or proof of content removal.

## Environment and scope

- Next.js local development server at `http://127.0.0.1:3001`, using the existing Playwright configuration.
- Memory-backed case, OTP, queue, audit and delivery-proof implementations; no database URL or Resend API key. Platform APIs disabled. Legal-review bypass explicitly disabled.
- Synthetic adult identities and URL strings only. No submitted media fetched or processed. The additional diagnostic blocks non-local browser requests and asserts that none occurred.
- Desktop Chromium and Pixel 5 emulation. This did not exercise the deployed Cloudflare Worker runtime.
- The current Cloudflare runbook states that no separate staging database exists and staging application testing must wait for isolation. Production cases, cron jobs, account settings and outbound notices were not changed.

## Executed checks

| Check | Result | Meaning |
| --- | --- | --- |
| Existing `smoke.spec.ts`, desktop and mobile | 16/16 passed | Landing/FAQ, minor diversion, adult registration and case creation, add link, manual resolution action, PDF export, deletion request, anonymous redirect and language preference |
| New `reporting-audit.spec.ts`, final run | 2/2 passed | OTP verification response, synthetic report creation, case API record, dashboard and explicit preview boundary; zero non-local browser requests |
| Nine focused Vitest files | 55/55 passed | Registration/idempotency and unsafe URL rejection, no-fetch invariant, minor zero-storage, deletion, dispatch gates, multi-URL signing and webhook recording; mocks/memory implementations, not provider integration |
| ESLint on new diagnostic | Passed | New test file passes lint |

The first diagnostic desktop run failed because its redirect assertion used a 5-second timeout during development compilation. The test now waits for the OTP verification response and allows 30 seconds for the redirect, consistent with the existing smoke test. Both projects passed on rerun. Existing smoke checks were not changed.

## Critical boundary observed

The diagnostic receives a successful case-creation response, confirms one registered URL with `NOTICE_QUEUED`, and reaches the case dashboard. The notice-preview API then returns **404 `{ "error": "no_eligible_url" }`**.

The preview handler deliberately refuses to generate a notice in memory mode because no verified contacts or reviewed templates are present. The UI falls back to the dashboard. The existing smoke test permits this fallback, so its “full adult flow” name must not be read as proof of signing or delivery.

The captured dashboard nevertheless says **“Your notice is ready to sign”** and **“Asmita has reviewed your submission and prepared a legal takedown notice.”** That is misleading in this tested state: the preview was unavailable and no human review was established. Readiness messaging should depend on actual eligible notice/template state, with a clear pending-review or unavailable explanation. This finding is verified locally; its occurrence in the deployed environment was not tested.

`NOTICE_QUEUED` is not evidence that a notice was sent, delivered, acknowledged or acted on. Manual resolution in the dashboard is not independently verified removal. A deletion-request test does not establish that production retention jobs completed.

## Still required for a true delivery test

1. Provision an isolated staging database and Worker configuration, with migrations and no production data or production cron targets.
2. Use a synthetic platform/contact and a legally reviewed test template. Route all mail to a founder-controlled test inbox; never target an actual platform with a synthetic allegation.
3. Run registration, OTP receipt, URL submission, notice preview and signing, then authorised dispatch with persistent records.
4. Verify actual inbox receipt, signed provider callbacks, status transitions, audit history and duplicate-send prevention. Exercise retries/failure handling and scheduled jobs on synthetic records only.
5. Verify ownership/access isolation, deletion scheduling and completed retention jobs. Treat legal, safeguarding, security and accessibility reviews as separate launch gates.

## Reproduction

Run from `asmita/`, with external credentials absent and the legal-review bypass disabled:

```powershell
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/reporting-audit.spec.ts --workers=1 --reporter=list
npx vitest run tests/integration/case-registration.test.ts tests/integration/no-url-fetch.test.ts tests/integration/minor-zero-storage.test.ts tests/integration/account-delete.test.ts tests/unit/notice-dispatch.test.ts tests/unit/notice-dispatch-route.test.ts tests/unit/webhook-events.test.ts tests/unit/multi-url-signing.test.ts tests/unit/api-routes.test.ts
npx eslint tests/e2e/reporting-audit.spec.ts
```

Final diagnostic screenshots are in the ignored `test-results/reporting-audit-verified/` directory, one per project. No application behavior was changed; the repository additions are this report and the local-only diagnostic test.
