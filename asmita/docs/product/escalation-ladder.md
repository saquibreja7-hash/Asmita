# Escalation ladder

Status: plan, November 2026. Owner: Saquib.

## Why

Organisations with the best removal rates (eSafety Australia, UK Report Harmful
Content, the Revenge Porn Helpline, all around 90%) do not stop at the first
notice. When a platform ignores a report, they move it up a level. Asmita sends
a notice and then, in practice, stops.

## What exists today (audit, 2026-11-08)

`src/lib/escalation-engine.ts`, run by `/api/cron/sweep-due-jobs` once a day
(20:30 UTC):

| Level | When | What |
|---|---|---|
| L1 | 24h after the notice | Sends the `ESCALATION_L1` covering letter followed by the original notice text to the grievance officer. Blocked unless both templates are legally reviewed and the contact is human-verified |
| L2 | 48h | Emails the survivor that there is no response yet |
| L3 | 7 days | Emails the survivor that an "FIR package" is ready, linking `/api/cases/:id/export` |

Gaps:

1. **The ladder ends with an email.** Nothing helps the survivor take the next
   legal step: an appeal to the Grievance Appellate Committee (GAC) or a
   complaint on the National Cybercrime Reporting Portal (NCRP).
2. **The L3 PDF link is broken in production.** `fir-package-generator.ts`
   reads fonts with `node:fs`, which Workers cannot do (the dashboard download
   was removed for the same reason).
3. **Form-only platforms (Meta, X, LinkedIn) never escalate.** No Notice row is
   sent for them, so the sweep never sees them.
4. **An acknowledgement stops everything.** "Acknowledged" without removal
   leaves the survivor with no next step.
5. **The survivor cannot see the ladder.** The dashboard shows a status, not
   what happens next or when.
6. **A daily sweep makes a 24h step up to 48h late.**

## The ladder

One ladder per link. Every step is shown to the survivor with its date.

| Step | Starts | Who acts | What Asmita does |
|---|---|---|---|
| 1. Notice sent | Dispatch, or the survivor saying she filed the platform form | Asmita | Unchanged |
| 2. Platform deadline | 2h after step 1 (`PLATFORM_DEADLINE_HOURS`) | Asmita | L1 follow-up to the grievance officer at 24h (email platforms only) |
| 3. Cybercrime complaint | The platform's deadline passed without removal, or it refused | Survivor | Dashboard links cybercrime.gov.in with a checklist (and prepared wording once legally reviewed). The 48h email tells her |
| 4. GAC appeal | 7 days without removal (the grievance officer's resolution period), or a refusal | Survivor | Dashboard links gac.gov.in with a checklist and wording. The 7-day email tells her |

Stop conditions: the link is marked removed, or the survivor closes it.
An acknowledgement or a refusal never stops the ladder; a refusal opens steps 3 and 4 at once. Both routes come from the MeitY NCII SOP (cybercrime.gov.in; GAC appeal under Rule 3A at gac.gov.in when the grievance officer does not respond in time or the survivor is dissatisfied).

### Rules

- **The survivor files the GAC appeal and the NCRP complaint herself.** Asmita
  prepares text; it never files with a government body on her behalf.
- **Never invent facts.** Draft wording cites only PRD Section 4 or the MeitY
  NCII SOP. Anything else is tagged `[CITATION REQUIRED]`.
- **Legal gate.** The drafts are legal text, so they follow the same gate as
  notices: shown only when `ESCALATION_DRAFTS_REVIEWED=true` (set after a human
  legal review) or in development with `DEV_SKIP_LEGAL_REVIEW=true`. Until
  then, step 3 shows the steps and official links without draft wording.
- **No URL in the drafts by default.** The survivor pastes her own link where
  the draft says so, keeping NCII URLs out of copied text she might share.
- **Minors never reach this flow** (the case flow is adult-only already).

### Deadlines

- Platform: 2 hours, under Rule 3(2)(b) as amended by G.S.R. 120(E) (in force
  20 February 2026; PRD Section 4). The notice templates were redrafted to
  demand 2 hours in November 2026 (`docs/legal/notice-redraft-2026-11.md`), so
  the ladder matches what the survivor signs.
- Grievance officer: 7 days to resolve (February 2026 amendment, PRD Section 4).
  After that, or after a refusal, the GAC appeal opens.
- The GAC's own appeal window is not in PRD Section 4 or the SOP, so the site
  says "file soon" instead of giving a date.

## Built (November 2026)

1. `src/lib/escalation-ladder.ts`: pure function from a link's data to the
   steps, their state and dates. Unit-tested, and rendered in a view test.
2. Engine fixes: notices now record their template (the 24h follow-up was
   blocked for every notice without it); follow-up rows carry `followUpOf` and
   are never swept as notices of their own (they would have emailed survivors
   twice); L2 and L3 carry Resend idempotency keys; a blocked follow-up is
   skipped once instead of retried; an acknowledgement or refusal no longer
   ends the ladder; the sweep runs hourly.
3. L2 and L3 emails point at the dashboard's next steps. The L3 PDF link is
   gone until the PDF can be built on Workers.
4. Form-only links: an opt-in "keep track of these links" on the platform
   handoff keeps them in the case, and "I have filed the form"
   (`SubmittedUrl.platformFiledAt`) starts their ladder.
5. Dashboard: "What happens next" under each live link, with the
   cybercrime.gov.in complaint and the GAC appeal once they open. Prepared
   wording appears only with `ESCALATION_DRAFTS_REVIEWED=true`, set after a
   human legal review (or `DEV_SKIP_LEGAL_REVIEW` locally).

Later: a Workers-safe FIR PDF; recording platform replies (`Notice.responseType`)
from the notice inbox, so a refusal opens the appeal at once.

## Notice redraft (November 2026)

The templates were redrafted against the current IT Rules: 2-hour removal,
corrected sub-rule numbers, and two new templates. `ESCALATION_L1` is the
covering letter the 24h follow-up now sends ahead of the complaint's text; the
follow-up is held until both are legally reviewed. `FIR_PACKAGE` is the
survivor's own police complaint. Memo for counsel:
`docs/legal/notice-redraft-2026-11.md`.
