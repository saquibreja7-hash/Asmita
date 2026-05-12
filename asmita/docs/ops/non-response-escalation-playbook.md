# Non-response Escalation Playbook

Status: operational draft, pending legal and NGO partner review.

This playbook describes what Asmita does when a platform does not respond after a notice is sent. It mirrors `src/lib/escalation-engine.ts` and must be updated before changing escalation timings in code.

## Scope

- Applies only to adult victim cases.
- Applies only after a Tier 2 notice has been generated from a legal-reviewed template and sent to a human-verified platform contact.
- Does not apply to minor reports; those are routed to support resources and the POCSO protocol once finalized.
- Does not authorize sending notices to placeholder contacts.

## Timeline

All times are calculated in UTC from the notice `sentAt` timestamp.

| Level | Time after sentAt | Action | System behavior |
| --- | ---: | --- | --- |
| 1 | 24 hours | Email follow-up | Queue one follow-up reminder for the same submitted URL and notice. |
| 2 | 48 hours | Victim notification | Notify the victim that the platform has not responded and show next options in the dashboard. |
| 3 | 7 days | FIR/legal package | Prepare the 7-day legal support PDF package for victim handoff. |

## Idempotency

Each escalation level is processed once per notice URL pair. A completed level must be recorded before later runs so retries do not duplicate victim notifications, follow-up emails, or PDF generation.

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
