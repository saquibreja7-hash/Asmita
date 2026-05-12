# DPDP Implementation Rules Check

Checked on: 2026-05-12.

Status: DPDP Rules have been notified; product controls reviewed against current public guidance. This is not legal advice and must be reviewed by counsel before production.

## Sources Checked

- PIB explainer: `https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf`
- MeitY / Gazette notification reference summarized by PwC: `https://www.pwc.in/research-insights/news_alert/regulatory-insights/meity-notifies-digital-personal-data-protection-rules-2025.html`
- Enforcement timeline summary: `https://www.lexology.com/library/detail.aspx?g=314d0a35-26eb-45ef-b4df-5ee32f7ba127`

## Key Product Implications

- Consent and transparency: keep registration copy plain-language and purpose-specific.
- Data minimisation: continue URL hashing and no-upload/no-fetch design.
- Children: do not collect URL submissions from minors; current age gate routes minors to support before email collection.
- Security safeguards: keep field-level encryption, CSRF, secure session cookies, audit logs, and CI security checks.
- Breach response: prepare a breach notice template and incident workflow before staging beta.
- Data principal rights: account deletion and audit trail access are implemented; correction/access request workflow still needs legal/product approval.
- Grievance contact: publish a privacy contact before production.
- Retention: 30-day hard-delete job is scaffolded; retention schedule requires legal sign-off.

## Engineering Follow-ups

- Add production privacy contact once legal entity and email domain are available.
- Add breach notification runbook after legal review.
- Confirm whether Asmita could be classified as a Significant Data Fiduciary before launch.
- Re-check rules before public launch and quarterly after launch.
