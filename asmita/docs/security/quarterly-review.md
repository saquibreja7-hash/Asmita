# Quarterly Security Review

Status: operational checklist.

Run this review quarterly and before public launch.

## Commands

```bash
npm run security:audit
npm run type-check
npm run lint
npm run test
npm run test:e2e
npm run test:a11y
npm run test:lighthouse
```

## Checklist

- Review dependency advisories and document accepted risk.
- Confirm no URL-fetch invariant violations.
- Confirm CSRF coverage on all mutating routes.
- Confirm cookies are `httpOnly`, `sameSite`, and `secure` in production.
- Confirm submitted URLs are not fetched, previewed, emailed, or logged raw.
- Confirm minor pathway stores no user, case, URL, or audit records.
- Confirm platform contacts are human-verified before live dispatch.
- Confirm stale contact queue is empty or actively triaged.
- Confirm audit log hash chain verifies.
- Confirm account deletion and hard-delete job behavior.
- Confirm incident alert webhook is configured in staging and production.

## Output

Save reviewer, date, commands run, failures, accepted risks, and fixes opened. P1/P2 security or privacy issues block beta and public launch.
