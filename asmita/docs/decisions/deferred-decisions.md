# Deferred Decision Log

Updated: 2026-05-12.

## D-02: Anonymous vs. Registered Submissions

Current implemented decision: registered adult submissions only.

Rationale:

- Email OTP establishes a recoverable case dashboard without passwords.
- Confirmation emails avoid raw submitted URLs.
- Minor pathway branches before email collection and URL submission.
- Anonymous intake can be reconsidered later only after legal and safety review.

## D-03: Launch Languages

Current implemented decision: English and Hindi at launch.

Rationale:

- Core navigation and support flows include English/Hindi support.
- Hindi strings remain marked for qualified translator review before production.
- Additional languages should wait until support resources, legal text, and notice workflows can be reviewed by qualified translators.

## D-04: Supporter Pathway

Current implemented decision: post-launch supporter pathway.

Rationale:

- Phase 1 prioritizes adult victim self-submission and minor safety routing.
- Concerned adults are directed to support resources and child-safety guidance, not victim case creation on someone else’s behalf.
- NGO vouching/supporter flows require partner agreements and API key governance before live use.

## D-08: Non-response Escalation Playbook

Current implemented decision: documented in `docs/ops/non-response-escalation-playbook.md`.

Rationale:

- The system schedules follow-up at T+24h, victim notification at T+48h, and legal support package preparation at T+7d.
- Manual legal/NGO escalation remains human-owned.
