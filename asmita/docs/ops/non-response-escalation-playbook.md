# Non-response Escalation Playbook

Status: operational draft, pending legal and NGO partner review.

This playbook describes what Asmita does when a platform does not respond after a notice is sent. It mirrors `src/lib/escalation-engine.ts` (the automated emails) and `src/lib/escalation-ladder.ts` (what the survivor sees), and must be updated before changing escalation timings in code. Product plan: `docs/product/escalation-ladder.md`.

## Scope

- Applies only to adult victim cases.
- Applies only after a Tier 2 notice has been generated from a legal-reviewed template and sent to a human-verified platform contact.
- Does not apply to minor reports; those are routed to support resources and the POCSO protocol once finalized.
- Does not authorize sending notices to placeholder contacts.

## Timeline

All times are calculated in UTC from the original notice's `sentAt` timestamp. The sweep runs hourly (`15 * * * *`) and walks original notices only; follow-up rows carry `followUpOf` and are skipped.

| Level | Time after sentAt | Action | System behavior |
| --- | ---: | --- | --- |
| 1 | 24 hours | Email follow-up | One follow-up to the grievance officer, resending the reviewed template. Skipped once (and recorded) if the platform already answered, the template is no longer reviewed, or the contact is not verified. |
| 2 | 48 hours | Victim notification | Email the survivor that the platform has not removed it; the dashboard now offers a cybercrime.gov.in complaint. |
| 3 | 7 days | Next steps | Email the survivor that she can appeal to the Grievance Appellate Committee and file a police complaint. Points at the dashboard; the PDF package cannot run on Workers yet. |

A platform's acknowledgement or refusal does not stop levels 2 and 3: nothing has been removed. Only removal (marked by the survivor or recorded on the notice) or an Asmita rejection stops the ladder.

Form-only platforms (Meta, X, LinkedIn) get no emails. If the survivor opted to keep the link in her case and says she filed the platform form (`SubmittedUrl.platformFiledAt`), the dashboard shows the same steps on the same timings.

## Idempotency

Each escalation level is processed once per notice. A completed or skipped level is recorded before later runs. Every email carries a Resend idempotency key (`follow-up:…`, `l2:<noticeId>`, `l3:<noticeId>`), so a retry within 24 hours never sends twice.

## Manual Review Gates

The following decisions remain human-owned and must not be automated without written approval:

- Whether a specific non-response should trigger legal outreach beyond the standard follow-up.
- Whether a case should be referred to an NGO partner.
- Whether any content indicates child sexual abuse material or a POCSO reporting obligation.
- Whether a platform contact is stale and needs replacement.

## Operator Checklist

- Confirm the notice was sent to a verified contact.
- Confirm no bounce or complaint event marked the platform contact stale.
- Confirm the victim dashboard shows the latest status without exposing submitted URLs in email.
- Confirm the escalation level has not already completed.
- Record any manual override as an audit event.

## Change Control

Any timing, template, or action change requires:

- Product owner approval.
- Legal advisor review if notice wording, victim guidance, or law-enforcement handoff text changes.
- Test updates for `createEscalationSchedule` and `runDueEscalations`.
