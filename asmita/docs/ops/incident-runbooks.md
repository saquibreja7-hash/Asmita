# Incident Runbooks

Status: operational draft. The on-call owner must replace placeholders with live contacts before beta.

These runbooks keep response actions consistent without exposing victim PII, submitted URL strings, secrets, or unreviewed legal guidance.

## Email Outage

Trigger: OTP, case updates, notice dispatch, or webhook processing fails above the alert threshold.

1. Pause notice dispatch workers if legal notices may be duplicated or sent from an unverified domain.
2. Check provider status, sender-domain verification, SPF, DKIM, DMARC, API key validity, and recent bounce or complaint spikes.
3. Confirm OTP fallback messaging does not ask victims to paste intimate content or raw URLs into support channels.
4. Resume transactional email first, then notice dispatch after one successful provider health check.
5. Record outage window, affected message types, provider incident link, and victim-facing mitigation.

## Stale GO Contact

Trigger: bounce, complaint, failed manual verification, expired verification date, or researcher report.

1. Mark the platform contact stale and block new dispatch to that contact.
2. Keep affected URLs in review or handoff state; do not route to placeholder contacts.
3. Assign GO researcher to verify source URL, contact name, address, email, form URL, and verification date.
4. Require reviewer identity before re-enabling dispatch.
5. Audit the stale mark, replacement source, and reactivation decision.

## Scheduler Failure

Trigger: escalation sweep lag above 30 minutes, duplicate job execution, or Cron Trigger failure.

1. Stop outbound notice dispatch if duplicate notices or victim notifications are possible.
2. Inspect Cloudflare Cron Trigger executions, Worker logs, idempotency keys, and due escalation counts. Redis/BullMQ queues were removed 2026-10-31 (ADR 004): scheduled work is Cron Triggers calling the `/api/cron/*` sweep routes (authenticated by `CRON_SECRET`), deduplicated by the Notice table and Resend idempotency keys.
3. Re-run due work only through the idempotent cron entrypoints, never by hand-crafted requests.
4. Verify T+24h, T+48h, and T+7d actions complete exactly once per notice URL pair.
5. Watch sweep lag, escalation backlog, notice dispatch latency, and API 5xx rate for one hour after recovery.

## Data Breach

Trigger: suspected unauthorized access, PII exposure, secret leakage, cleartext logs, or audit integrity failure.

1. Freeze deploys and preserve logs, audit hashes, database snapshots, and access records.
2. Revoke exposed credentials and rotate secrets in staging and production.
3. Disable affected admin or API credentials while preserving append-only audit records.
4. Determine whether victim email, identity fields, notice payloads, or submitted URL evidence were exposed.
5. Escalate to legal/privacy reviewer for DPDP and contractual notification obligations.
6. Do not delete audit evidence except through approved retention/deletion workflows.

## POCSO Or CSAM Concern

Trigger: any report, support message, or partner communication suggests the victim or content may involve a minor.

1. Stop normal adult-flow automation for the affected case.
2. Do not request, view, store, forward, or summarize intimate media.
3. Route to the approved POCSO protocol once legal signs it; until then, escalate to the named legal owner.
4. Share only the minimum metadata needed with authorized responders.
5. Record the decision path without storing Aadhaar numbers, intimate content, or unnecessary victim details.

## Legal Threat

Trigger: takedown counter-notice, defamation threat, platform legal escalation, law-enforcement request, or court notice.

1. Preserve all related audit events, notice payload hashes, template versions, timestamps, and delivery proof.
2. Pause further automated outreach for the affected case until legal review.
3. Confirm the notice template version was legally reviewed and the GO contact was verified at send time.
4. Prepare a case package for legal counsel without adding victim phone, Aadhaar, or unconsented name disclosure.
5. Record legal owner, response deadline, approved response, and any product change requested.

## Closure

Every incident must close with owner, timeline, root cause, affected cases count, victim impact assessment, corrective actions, and whether a TODO or code change is required.
