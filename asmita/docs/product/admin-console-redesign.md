# Admin console redesign

Status: recommendation, 8 November 2026. Phases 0, 1 and 2 are built on `feat/admin-console-phase-0` (9 November); Phases 3 and 4 are not started. Owner: Saquib.

## In one paragraph

The console is a set of separate pages, each of which loads every case into
memory and renders it as one table. That stops working at a few hundred cases,
but scale is not the worst problem. Two operator jobs have no screen at all
(sending a signed URL notice, and recording a platform's reply), there is no
admin case page, and three pages show placeholder or isolate-local data as if it
were real, including a templates table that says every template is legally
reviewed and active. The recommendation is, in order: make every page tell the
truth (Phase 0), give cases a server-paginated list and a real case page with a
dispatch button (Phase 1), add a "Needs action" home that counts each queue and
sorts by what is due (Phase 2), then add the speed features: slide-over peek,
keyboard navigation, bulk actions and saved views (Phase 3). Team features
(assignment, notes, step-up MFA) wait until there is more than one operator
(Phase 4).

## 1. Who operates the console and what they need to get done

Roles come from `src/lib/auth/admin-permissions.ts`. Today every admin is an
allowlisted founder, and a session without an `adminRole` claim is treated as
`SUPER_ADMIN` (`src/lib/auth/require-admin.ts`).

| Role | Permissions | Main jobs |
|---|---|---|
| SUPER_ADMIN | all | everything below, plus admin enrolment and MFA resets |
| CASE_REVIEWER | `cases:read`, `cases:review`, `audit:read` | triage, approvals, dispatch, replies |
| LEGAL_ADVISOR | `cases:read`, `templates:*`, `audit:read` | review notice and escalation templates |
| GO_EDITOR | `platforms:edit`, `metrics:read`, `audit:read` | keep grievance officer contacts verified |
| SUPPORT_AGENT | `cases:read`, `cases:note` | find a case while helping a survivor, leave notes |

Operator jobs, ranked by how much harm a delay causes:

1. **Clear flagged links inside the 4 hour SLA.** Approve or reject URLs that
   need a human (unknown platform, flag reason). Today: Flagged page.
2. **Send signed notices.** A survivor has signed the notice PDF, the link is
   approved, the platform contact is verified: send it. The platform's
   deadline (`PLATFORM_DEADLINE_HOURS`, 2h) starts only when this happens.
   Today: **no screen**. `/api/notices/dispatch` exists, but no page calls it.
3. **Review fingerprints and send hash advisories.** Today: Hash queue page,
   with a separate dispatch form below the table.
4. **Unblock the escalation ladder.** The hourly sweep (PR #51) refuses an L1
   follow-up when the template is unreviewed, the cover letter is missing or
   the contact is unverified, and refuses L2 and L3 when the survivor's email
   cannot be decrypted. Each refusal is only a `NOTICE_FAILED` audit entry.
   Today: **invisible** unless you read the audit log.
5. **Record what the platform did.** Acknowledged, removed, refused. This
   stops or forks the ladder (`docs/product/escalation-ladder.md`). Today:
   **no screen and no API**; nothing in production code writes
   `Notice.responseType` or `Notice.removedAt`.
6. **Keep platform contacts verified.** Re-verify stale contacts with a source
   URL. Today: Platforms page (works, audited, keeps history).
7. **Find one case fast.** A survivor calls the helpline or emails; the
   operator needs that case's state in seconds, by reference. Today: scroll the
   cases table or use the browser's find. No case page to land on.
8. **Review legal text.** Today: Templates page, which shows hard-coded rows.
9. **Oversight.** Audit trail, response rates, analytics, milestones.

## 2. Problems with the current console

Evidence is from the code at commit `ff27671`.

### It does not scale

- `listAdminCaseRows` (`src/lib/admin-dashboard.ts`) calls `listAllCases()`,
  which loads every case with every submitted URL, then filters in
  JavaScript. Flagged, Milestones and Analytics do the same. Each page load is a
  full scan of `Case` and `SubmittedUrl`, inside a Worker with a CPU budget.
- There is no pagination, no sort control and no total count.
- There are no indexes for the list: `Case` has none on `status` or
  `createdAt`, `SubmittedUrl` has none on `caseId` or `status`, `Notice` has
  none on `urlId` or `sentAt`.

### Rows lead nowhere

- There is no `/admin/cases/[id]` page. The reference is plain text, not a link.
- No row has an action. To approve a flagged link you go to another page and
  find the same reference again.

### The columns do not say what to do next

- "Escalation" is not the escalation ladder. It is derived from URL statuses
  (`review`, `queued`, `resolved`, `none`). "Queued" in the screenshot means
  `NOTICE_QUEUED`: approved, not yet sent. It ignores `Notice.escalationLevel`,
  the ladder steps and blocked follow-ups.
- "Review flags" is a bare number. The operator has to translate every row into
  "what do I do here", which is the console's job.
- The status filter offers Open and Resolved; `CaseStatus` has five values
  (Open, Partially resolved, Resolved, Closed, Escalated).
- Platform is a free-text filter, so "youtube" and "YouTube " behave differently
  from the platform directory.

### Some pages show data that is not real

These matter more than layout, because operators make legal decisions from them.

- **Templates** (`listTemplateEditorRows`) returns three hard-coded rows that
  say "Reviewed" and "Active". The real `NoticeTemplate` rows are seeded with
  `reviewedByLegal: false`. The page reads as if the legal gate were cleared.
- **Response rates** (`listPlatformResponseDashboardRows`) is three
  hard-coded samples (Instagram, Pornhub, Telegram) with a fixed 18h median.
- **NGO vouching** shows a placeholder row when there are no vouches.
- **Audit** lists `inMemoryAuditLog`, the events written by the current Worker
  isolate since it started. The database copy (`AUDIT_LOG_PERSISTENCE=database`)
  is written and its chain is validated, but the table never reads it. In
  production the list is close to empty and changes between requests.
- **Analytics** derives "notice sent" and "removed" times from the case's
  creation time plus fixed offsets (`addHours(record.createdAt, 24)`).

### Permissions are enforced but not shown

- Every role sees every nav item. A GO_EDITOR who opens Cases gets the page
  (layout only checks `requireAdmin`), and a SUPPORT_AGENT who clicks Approve
  gets a 403 after the click ("Error - reload").
- `cases:note` exists but there is nothing to write a note into.
- `AdminAccessLog` exists in the schema but nothing writes to it, so there is no
  record of which admin looked at which case.

### Smaller issues

- Filters need an "Apply filters" submit and a full reload. Nothing shows which
  filters are active or offers a reset.
- The nav has no counts, so the operator cannot tell from any page that 3
  flagged links are about to breach SLA.
- Hash queue copy still says "Phase 2 hash intake is disabled".
- Tables have no `<caption>`, no `aria-sort`, and a `min-w-[760px]` that forces
  horizontal scrolling on a phone. Created times use the full `en-IN` locale
  string, which wraps onto two lines.
- Approve and Reject on Flagged act on one click, with no reason captured for a
  rejection that the survivor will see.

## 3. What mature consoles do

Research summary. Numbers in brackets refer to Appendix A.

- **Views are saved filters, shared and personal.** A Zendesk view is a set of
  conditions with its own columns and sort; admins make shared views, agents
  make personal ones [1]. Intercom views are workspace-wide but pinning is
  personal [2]. Linear keeps new items in a separate Triage stage with four
  keyed outcomes until someone accepts them [3].
- **Counts only where they matter, and capped.** Jira Service Management
  keeps live counts only for starred and priority queues and stops at "999+"
  [4]. Linear's Inbox separates a Priority tab from the rest [15].
- **Sort by deadline, show the countdown on the row.** Jira queues are usually
  sorted by an SLA with a clock per row [5]; Intercom's "Next SLA" sort shows a
  coloured timer and pauses it while the item waits on the customer [6][7];
  Zendesk has a "Next SLA breach" badge with every target on hover [8].
- **Cursor pagination for queues.** Zendesk refuses offset paging past 10,000
  records and offers cursors (`after_cursor`, `has_more`) [9]; Stripe uses
  `starting_after` with an object id [10]. Offset paging re-reads skipped rows
  and repeats or skips items when rows change between pages [11], which is
  exactly what a worked queue does.
- **Select, then a bar of actions.** Zendesk bulk-edits checked rows, even in
  filtered views [12]; Linear selects with `x` and Shift ranges and shows a
  bulk bar [13].
- **Confirm the serious, undo the rest.** A confirmation should name the item
  and consequence, and its button should be the verb; routine confirms train
  people to click through [14]. Reversible actions get an undo snackbar
  instead [16]; Gmail binds `z` to undo [17].
- **Keyboard vocabulary is shared.** `j`/`k`, `x`, `e`, `z`, `?` (Gmail [17]);
  `g` chords and Space to peek with `j`/`k` still working (Linear [15][18]).
  WCAG 2.1.4 requires single-key shortcuts to be switchable off, remappable,
  or active only while their component has focus [19].
- **A non-modal side panel for quick work, a page for big work.** Atlassian
  recommends a drawer for a secondary task and a new page for large ones, and
  warns that a modal drawer hides the list people need to refer to [20].
  Material's standard side sheet keeps the main content usable [21]. The
  WAI-ARIA dialog pattern covers focus in, Escape and focus back [22].
- **Loading and empty.** No indicator under a second, skeletons for full pages
  that take 2 to 10 seconds [23]. "Cleared" and "blank slate" are different
  empty states; one short line and one verb action [24].
- **Tables.** Native `<table>` for reading and comparing; the ARIA grid only
  when you will manage cell focus yourself [25]. `aria-sort` on the sorted
  header only, header text as a button [26]; caption and `scope` [27];
  stacked rows on mobile [28].
- **Trust and safety.** Interactive reveal reduced emotional impact without
  hurting accuracy [29]; greyscale helped in Google's study [30], though a 2026
  study found no effect [31], so treat it as a mitigation, not a fix. TSPA's
  curriculum recommends showing reviewers only the data they need and
  previews so they do not have to open URLs [32]. Hive never shows CSAM in its
  review feed, only links that open separately, with every report logged [33],
  which matches Asmita's no-media rule. Maker-checker tools block a maker from
  approving their own item and re-check the evidence at approval [34]. Crisis
  Text Line ranks its queue by risk, not arrival [35].

What this means for Asmita: one list sorted by the next deadline, queues as
views of it, a peek panel for approvals and a full page for dispatch, confirm
only what leaves Asmita or clears a legal gate, and never show more of the
survivor's material than the task needs.

## 4. Proposed information architecture

```
Admin
  Needs action        <- new home, counts per queue
  Cases               <- one paginated list, saved views
  Queues
    Flagged links        (4h SLA)
    Fingerprints         (review)
    Ready to send        (new: signed + approved + verified contact)
    Blocked steps        (new: ladder refused by a gate)
    Awaiting reply       (new: platform deadline passed, record reply)
  Directory
    Platforms            (contacts, stale first)
    Templates            (from the database)
  Insight
    Response rates · Analytics · Milestones
  Oversight
    Audit
```

Each queue is a filtered view of either cases or of the items inside them
(links, fingerprints, notices). The nav shows a count beside each queue and
hides what the role cannot use. A GO_EDITOR sees Needs action (with only the
platform tiles), Platforms, Insight and Audit.

### Needs action (home)

```
+------------------------------------------------------------------------+
| Needs action                                       Updated 23:06 IST  |
|                                                                        |
| +----------------+ +----------------+ +----------------+ +-------------+|
| | Flagged links  | | Ready to send  | | Blocked steps  | | Awaiting    ||
| |      7         | |      4         | |      2         | | reply   11  ||
| | 2 breach SLA   | | oldest 3h      | | legal review 2 | | 5 past 24h  ||
| | oldest 5h 10m  | |                | |                | |             ||
| | [Open queue]   | | [Open queue]   | | [Open queue]   | | [Open queue]||
| +----------------+ +----------------+ +----------------+ +-------------+|
| +----------------+ +----------------+ +----------------+                |
| | Fingerprints   | | Stale contacts | | Templates to   |                |
| |      3         | |      6         | | review     9   |                |
| | oldest 40m     | | Meta, X, ...   | | (legal)        |                |
| +----------------+ +----------------+ +----------------+                |
|                                                                        |
| Due next                                                               |
|  ! ASMITA-2026-SQWGCD  Review 1 flagged link       breached 1h 10m     |
|  ! ASMITA-2026-2VTECS  Send notice (YouTube)       due in 20m          |
|    ASMITA-2026-8K9GFR  Record reply (YouTube)      due in 2h           |
+------------------------------------------------------------------------+
```

Tiles show a count, the oldest item's age and the number past SLA, in text as
well as colour. A tile at zero says "Clear" and stays in place so the layout
does not jump. "Due next" is the top ten rows of the Cases list sorted by due
time, so the home page and the list never disagree.

## 5. The case list

```
+------------------------------------------------------------------------+
| Cases                                   [ Search reference...  / ]     |
| Views: [Due soon 12] [All open 46] [Sent, no reply 11] [Resolved] [+]  |
| Filters: Status: Open x   Platform: YouTube x   + Add filter   Reset   |
|------------------------------------------------------------------------|
| [ ] Reference          Next action           Due        Links  Step  Age|
|------------------------------------------------------------------------|
| [ ] ASMITA-2026-SQWGCD Review 1 link         ! -1h10m   3      -     5h |
| [x] ASMITA-2026-2VTECS Send notice           20m        1      1    6h |
| [x] ASMITA-2026-8K9GFR Record reply          2h         2      2    1d |
| [ ] ASMITA-2026-V4FPQG Blocked: legal review -          1      2    2d |
| [ ] ASMITA-2026-HQS9FZ Waiting on survivor   -          1      1    2d |
|------------------------------------------------------------------------|
| 2 selected  [Approve links] [Reject links...] [Clear]                  |
|                     Showing 1 to 50 of 312      [< Newer] [Older >]    |
+------------------------------------------------------------------------+
```

With a row open in the slide-over:

```
+-------------------------------------------+----------------------------+
| (list stays visible, dimmed rows remain   | ASMITA-2026-2VTECS     [x] |
|  clickable; j/k moves the panel)          | Open · created 7 Nov 13:12 |
|                                           | Next: send notice, due 20m |
|                                           | [Send notice...] [Note] [↗]|
|                                           |----------------------------|
|                                           | Links                      |
|                                           | 1 youtube.com   YouTube    |
|                                           |   Approved · signed 8 Nov  |
|                                           |   Contact verified 2 Nov   |
|                                           |   [Reveal link] (logged)   |
|                                           |----------------------------|
|                                           | Fingerprints  2 approved   |
|                                           |   in signed annex: 2       |
|                                           |----------------------------|
|                                           | Timeline                   |
|                                           | 8 Nov 12:40 notice signed  |
|                                           | 7 Nov 13:20 link approved  |
|                                           | 7 Nov 13:12 case created   |
+-------------------------------------------+----------------------------+
```

### Columns

| Column | Content | Why |
|---|---|---|
| Select | checkbox, label "Select ASMITA-2026-..." | bulk actions |
| Reference | monospace, links to `/admin/cases/[reference]` | the only identifier operators share |
| Next action | one derived phrase (below) | replaces "Review flags" and "Escalation" |
| Due | time to the next deadline, past due in text ("-1h10m") and colour | sort key |
| Links | count, with a tooltip of statuses | no URLs in the list |
| Step | ladder step 1 to 4 for the furthest-along link | replaces the misleading Escalation column |
| Platforms | up to two names, then "+n" | |
| Age | since creation, short form ("5h", "2d"); full IST timestamp on hover | fits on one line |

"Next action" is computed per case, first match wins:

1. a link is `PENDING_REVIEW` or flagged: **Review n links** (due: created + 4h)
2. a fingerprint is `PENDING_REVIEW`: **Review n fingerprints**
3. a link is approved, signed, contact verified, not sent: **Send notice** (due:
   signed time + an SLA to agree, suggested 4h)
4. a ladder step was refused by a gate: **Blocked: legal review / no verified
   contact / survivor email**
5. a notice is past its platform deadline with no recorded reply: **Record
   reply** (due: sent + 24h, the L1 point)
6. a link is approved but unsigned: **Waiting on survivor** (no due time)
7. otherwise: **None**

### Pagination, sorting and search

- **Keyset cursor**, 50 rows per page, newer and older buttons, plus "Showing 1
  to 50 of 312". The total is a separate `count(*)` capped at 10,000 ("10,000+").
  Offset paging would be fast enough at Asmita's volume, but rows leave a queue
  as they are worked, and offset pages then skip items. The cursor encodes the
  sort key and `id`.
- **Sorts**: Due soonest (default, empty due times last), Newest, Oldest,
  Recently updated. Sorting is server-side; the header button carries
  `aria-sort`.
- **Search** is by reference only: exact, or the six-character suffix
  ("SQWGCD"). The list never searches URL text. Finding a case from a URL can
  come later as a hash lookup (the server already stores `urlHash`), with the
  input never logged.
- **Filters** apply on change and live in the URL query, so every view is a
  link. Active filters show as removable chips with a Reset. Status is a
  multi-select over all five `CaseStatus` values; Platform is a select from the
  `Platform` table; Next action and Step are selects; Created is a date range.

### Saved views

System views, shared by everyone and not editable: Due soon, All open, Sent and
awaiting reply, Blocked, Resolved. Personal views are any filter and sort
combination saved by name. Each view shows its count. Shared custom views can
come later and only a SUPER_ADMIN can create them.

### Row actions

Revealed on hover and on keyboard focus, and always available from a "More"
menu so touch and screen reader users are not left out.

- Open (full page), Peek (slide-over), Copy reference
- Approve or Reject the flagged link, when there is exactly one
- Send notice, when Next action is Send notice (opens the confirm dialog)
- Add note (Phase 4)

### Bulk actions

A sticky bar appears once anything is selected: "2 selected", the actions that
apply to all of them, and Clear. After a run it lists each item's result, with
failures first and a reason ("signed_fingerprints_changed"). Limits: 50 items
per run; each item is audited on its own, plus one summary event.

Allowed in bulk: approve links, reject links (one reason for all), approve
fingerprints, reject fingerprints, assign (Phase 4).

Never in bulk: send notice, send hash advisory, record "removed", mark a
contact verified, any template action. Each of these sends a legal document or
clears a legal gate, and each needs its own preview.

### Slide-over panel

- Opens on row click or `Enter`, from the right, about 520px wide; on a phone
  it is a full-screen page.
- The URL gains `?peek=ASMITA-2026-...`, so it can be shared and survives a
  reload. `Esc` closes it and returns focus to the row. `j`/`k` move to the next
  case without closing.
- Contents, top to bottom: header (reference, status, age, next action),
  action bar, links (domain, platform, status, step, contact verified date),
  fingerprints (counts by status, truncated digest, which ids are in the signed
  annex), timeline (created, approved, signed, sent, delivered, follow-ups,
  reply), notes, audit entries for the case.
- No URL text by default. **Reveal link** asks for a reason (select: "check
  removal", "survivor asked", "platform asked", other), records it in
  `AdminAccessLog` and the audit log, shows the URL as plain text for 30 seconds
  and never as a clickable link. Opening a case writes an `AdminAccessLog` view
  entry too.
- Survivor identity (email, phone) is not shown in the console at all.

### Keyboard

Active only when focus is inside the list or panel, never while typing in a
field, and switchable off in a small preferences menu (WCAG 2.1.4).

| Key | Action |
|---|---|
| `j` / `k` | next / previous row (moves the panel if open) |
| `x` | select row |
| `Enter` or `Space` | peek |
| `z` | undo the last approve, reject or assign. There is no un-approve API, so undo works by holding the request in the browser for 5 seconds before sending it |
| `o` | open full page |
| `Esc` | close panel, clear selection |
| `/` | focus reference search |
| `a` / `r` | approve / reject the focused flagged link (reject opens the reason prompt) |
| `g` then `h`, `c`, `q` | go to Needs action, Cases, Queues |
| `?` | shortcut sheet |

No single key sends anything outside Asmita.

### Empty, loading and error states

- **Loading**: skeleton rows at the real row height, so the page does not jump;
  a filter change keeps the old rows visible and dimmed with a small progress
  bar instead of blanking the table.
- **Queue clear**: "Nothing waiting here" plus a link to the next queue that
  has items. No illustration needed.
- **No matches**: "No cases match these filters", the active chips, and Reset.
  Distinct from "queue clear", because one means the work is done and the other
  means the filter is wrong.
- **Error**: "Could not load cases. Nothing has changed." with Retry. Never an
  empty table that looks like an empty queue.
- **Action errors** use the server's code in words ("This notice was already
  sent"), not "Error - reload".

### Accessibility

- A real `<table>` with `<caption>`, `scope="col"` and `aria-sort`, not an ARIA
  grid. The grid pattern needs full arrow-key cell navigation, which is more
  than this needs.
- Every checkbox and icon button has a text label naming the case.
- The slide-over is a non-modal dialog (`role="dialog"`, labelled by the
  reference), focus moves into it on open and back to the row on close.
- Due and SLA state use text and an icon, never colour alone.
- Results of actions are announced through one polite live region.
- Respects `prefers-reduced-motion` (no slide animation).
- Below 768px the table becomes a stacked list of cards, with the same order
  and actions, instead of a 760px table that scrolls sideways.

## 6. Which actions are safe inline

| Action | Permission | Where | Gate checked by the server | Confirmation |
|---|---|---|---|---|
| Copy reference, peek, open, filter, save view | `cases:read` | anywhere | none | none |
| Add note, assign (Phase 4) | `cases:note` / `cases:review` | inline, bulk | none | none, undo toast |
| Approve a flagged link | `cases:review` | inline, bulk | link not an unknown platform | none for one; bulk shows a summary first. It sends nothing; dispatch still needs the signature |
| Reject a flagged link | `cases:review` | inline, bulk | none | reason required, since the survivor sees the outcome |
| Approve a fingerprint | `cases:review` | inline, bulk | none | none for one; summary for bulk |
| Reject a fingerprint | `cases:review` | inline, bulk | none | reason required; warns when the fingerprint is in a signed annex, because rejecting it voids that signature (`voidSignaturesWithRejectedFingerprints`) and the survivor must sign again |
| Reissue platform portal link | `cases:review` | case page | none | confirm |
| Reveal a link | `cases:review` | case page, panel | link still retained | reason prompt, logged before the link is returned, 20 per admin per hour |
| Send a URL notice | `cases:review` | case page, panel | signature, approved, legal review, verified contact, idempotency key | dialog with recipient, template version and review date, fingerprint ids in the signed annex; button says "Send notice to YouTube" |
| Send a hash advisory | `cases:review` | case page, panel | same | same dialog |
| Record a platform reply | `cases:review` | case page, panel | none | dialog; "Removed" stops the ladder and says so |
| Mark a contact verified | `platforms:edit` | Platforms | source URL required | step-up MFA (Phase 4); until then, the sign-in MFA |
| Mark a template legally reviewed, activate | `templates:*` | Templates | reviewer name | step-up MFA (Phase 4); LEGAL_ADVISOR or SUPER_ADMIN only, never code |
| Issue enrolment code, reset MFA | `users:manage` | Admins (new, later) | none | step-up MFA |

Rules behind the table:

- If it sends something outside Asmita, it is one item, it has a preview, and
  its button names the recipient.
- If it clears a legal or contact gate, it needs a human with that role and
  (from Phase 4) a fresh MFA code.
- If the survivor will see the outcome, a reason is recorded.
- Everything else can be one click, because the server re-checks every gate on
  every request.
- Not in the console at all: editing signed notice text, moving a case past a
  minor check. If an operator suspects a minor, the action is "Hold for POCSO
  protocol", which freezes dispatch and hides links. That action depends on the
  POCSO protocol being written, so it is listed as an open question.

## 7. Build phases

Each phase ships on its own and leaves the console better than before.

### Phase 0: make every page tell the truth (small)

Do first, because operators make legal decisions from these pages.

- Templates reads `NoticeTemplate` (type, version, language, `reviewedByLegal`,
  `reviewedAt`, `reviewedByName`, `isActive`). Read-only for now.
- Audit reads `AuditLog` from the database, newest first, keyset paginated on
  `sequence`, filters on event type, actor and entity id (`entityId` and
  `createdAt` are already indexed).
- Response rates is computed from `Notice` (`sentAt`, `responseReceivedAt`,
  `responseType`, `removedAt`). Until Phase 2 records replies, it shows sent
  counts and says "Replies are not recorded yet". Remove the NGO placeholder row.
- Analytics stops inventing times from `createdAt` offsets; show only measured
  values.
- Data: none. API: none.

### Phase 1: a list that scales and a case page (built)

What was built, and where it differs from the plan:

- **Data** (migration `20261109000000_admin_case_list`): indexes
  `Case(createdAt)`, `Case(status, createdAt)`, `SubmittedUrl(caseId)`,
  `Notice(urlId)`; `AdminAccessLog` gains `entityType`, `entityId` (indexed)
  and `reason`; audit event `URL_REVEALED`.
- **Query**: `src/lib/admin-cases.ts`. Instead of one SQL query, it reads
  light rows per table through Prisma (the database path on the Worker) and
  derives Next action and Due in a pure function, `deriveCaseWork`. Every
  select names its columns: the encrypted link, the signed PDF and the
  fingerprint are never loaded (the old list loaded all three for every case),
  and "signed" is a separate `IS NOT NULL` query. Sorting and the keyset cursor
  run over the derived rows, so a case that leaves a view never makes the next
  page skip one. If this gets slow, store Next action and Due on `Case`.
- **Due times**: link and fingerprint review 4h after submission; Send notice
  4h after the case's first signature (no per-link signing time is stored);
  Awaiting reply is the platform deadline from `escalation-ladder.ts`.
- **No GET APIs yet**: the pages are server-rendered from URL parameters, so
  `GET /api/admin/cases` and `GET /api/admin/cases/[reference]` wait for the
  Phase 3 slide-over, which needs them.
- **UI**: `/admin/cases` with views (All open, Needs review, Ready to send,
  Awaiting reply, Blocked, Resolved), filters that apply on change, removable
  filter chips, sorts, 50 per page, cards below 768px. `/admin/cases/[reference]`
  with links, fingerprints, timeline, approve and reject, and Send notice
  behind a dialog that names the recipient, template and review. The retired
  portal reissue is not offered.
- **Reveal**: `POST /api/admin/urls/[urlId]/reveal` needs `cases:review`, not
  `cases:read` as planned: support agents do not see survivor links. The
  access log entry is written before the link is returned; if it fails, the
  link is not shown.
- **Found while building**: dispatch records a Notice row but never moves the
  link from `NOTICE_QUEUED` to `NOTICE_SENT` (nothing in the code sets
  `NOTICE_SENT`). The console treats a sent notice as sent regardless; the
  status itself is a separate fix because the survivor dashboard and the
  sweep read it.
- `listAdminCaseRows` is gone.

### Phase 2: Needs action and the missing queues (built)

What was built, and where it differs from the plan:

- **No migration.** Recorded replies use the existing audit events
  (`CONTENT_REMOVED` for a removal, `ADMIN_ACTION` otherwise).
- **Blocked steps without touching the engine.** Instead of new columns
  written by the sweep, the console reads the `NOTICE_FAILED` entries the
  sweep already writes (reason and level). A refusal counts while its level is
  above the level the notice reached, so a step sent later clears it. New next
  action: "Blocked: escalation step", with the reason on the case page.
- **Record reply**: `POST /api/admin/notices/[noticeId]/response`
  (`cases:review`) with `ACKNOWLEDGED`, `REMOVED` or `REJECTED` and the time it
  arrived (not before the notice, not in the future). Original notices only. A
  removal sets the notice's `removedAt` and the link's status to removed, which
  stops the ladder, the same as the survivor's own "mark removed"; it cannot be
  recorded twice. An acknowledgement or refusal stops the 24-hour follow-up, as
  the engine already does. The case's own status is not changed.
- **Needs action home** at `/admin`: tiles for links and fingerprints to review,
  ready to send, blocked (by reason), awaiting reply, platform contacts and
  templates to review, each with overdue and oldest, then the ten most urgent
  cases. Tiles open the matching case list view; "Blocked" is now one view over
  all three blocked reasons. Counts are per case (its first next action), so a
  tile and its list always agree.
- **No counts API.** Pages are server-rendered; the nav shows one count (open
  cases waiting on an operator), cached for 30 seconds per Worker isolate.
- **Queues stay views.** Ready to send, Blocked and Awaiting reply are case list
  views rather than separate pages. Flagged links and Fingerprints keep their
  pages; Flagged now reads named columns only (it used to load every case with
  its encrypted links and PDFs). Neither is paginated yet; both are bounded by
  the review backlog.
- **Hash advisory on the case page** when the case has approved fingerprints;
  the Fingerprints page keeps its form too.
- **Roles in the UI**: the nav is grouped (Work, Directory, Insight, Oversight)
  and shows only what the role can open; every page checks the same permission
  and says so instead of failing later. Milestones needs `metrics:read`. A test
  keeps nav and page permissions in step.

### Phase 3: speed (medium)

- **Slide-over** with `?peek=`. Check the routing approach (intercepting or
  parallel routes, or a client panel fed by `GET /api/admin/cases/[reference]`)
  against `node_modules/next/dist/docs/` first, per `AGENTS.md`, and against the
  vinext Worker build.
- **Keyboard** shortcuts with the `?` sheet and an off switch.
- **Bulk**: `POST /api/admin/bulk` with
  `{ action: "approve_urls" | "reject_urls" | "approve_hashes" | "reject_hashes", ids, reason? }`,
  maximum 50, per-item results, per-item audit plus one `ADMIN_BULK_ACTION`
  event. Dispatch is not an accepted action.
- **Saved views**: model `AdminSavedView { id, ownerEmailHash, name, query
  Json, shared Boolean, createdAt }`; `GET/POST/DELETE /api/admin/views`.

### Phase 4: a team (when there is a second operator)

- **Assignment**: `Case.assigneeEmailHash`, claim and release, "Mine" view.
- **Notes**: `CaseNote { id, caseId, authorEmailHash, bodyEncrypted,
  createdAt }`, written with `cases:note`, encrypted like other free text,
  never sent anywhere.
- **Step-up MFA**: an `mfaAt` claim in the admin session; actions in the
  table above that need it ask for a fresh code when `mfaAt` is older than 15
  minutes. `POST /api/admin/mfa/step-up`.
- **Second pair of eyes** for contact verification: the editor proposes, a
  different admin confirms. Only worth it with more than one admin.
- **Admins page** for SUPER_ADMIN: list admins, roles, issue enrolment codes,
  reset MFA (the APIs exist).

## 8. Open questions for Saquib

1. **SLAs.** Flagged links have 4h. What should "Send notice" and "Record
   reply" use? This doc assumes 4h after signing and 24h after sending.
2. **Where do platform replies arrive?** If they come to a Google Workspace
   inbox, recording them is manual (Phase 2). Parsing replies automatically is
   a separate project.
3. **Do operators need to see URLs at all?** If checking removal can be left to
   the survivor or to a platform reply, drop Reveal link entirely.
4. **POCSO hold.** The console needs a "Hold for POCSO protocol" action for a
   case that turns out to involve a minor. What it does depends on the
   protocol, which is still a launch gate.
5. **When does a second operator join?** That decides whether Phase 4 is next
   quarter or next year.

## Appendix A: sources

Checked 8 November 2026. Items marked "partly unverified" could not be fully
confirmed from the primary page.

1. Zendesk, creating views: https://support.zendesk.com/hc/en-us/articles/4408888828570
2. Intercom, custom views and folders: https://www.intercom.com/help/en/articles/6588834-organize-your-inbox-with-custom-views-and-folders
3. Linear, Triage: https://linear.app/docs/triage
4. Jira Service Management, priority groups: https://support.atlassian.com/jira-service-management-cloud/docs/arrange-queues-into-groups-to-prioritize-work-for-your-team/
5. Jira Service Management, queues: https://support.atlassian.com/jira-service-management-cloud/docs/check-out-your-queues/
6. Intercom, inbox sorting: https://www.intercom.com/help/en/articles/6989006-inbox-sorting
7. Intercom, SLAs and office hours: https://www.intercom.com/help/en/articles/9263617-slas-and-office-hours
8. Zendesk, SLA badges: https://support.zendesk.com/hc/en-us/articles/5430058226330
9. Zendesk API, pagination: https://developer.zendesk.com/api-reference/introduction/pagination/
10. Stripe API, pagination: https://docs.stripe.com/api/pagination
11. Use The Index, Luke, no offset: https://use-the-index-luke.com/no-offset
12. Zendesk, managing tickets in bulk: https://support.zendesk.com/hc/en-us/articles/4408886890906-Managing-tickets-in-bulk
13. Linear, selecting issues: https://linear.app/docs/select-issues
14. Nielsen Norman Group, confirmation dialogs: https://www.nngroup.com/articles/confirmation-dialog/
15. Linear, Inbox: https://linear.app/docs/inbox
16. Material Design 2, confirmation and acknowledgement: https://m2.material.io/design/communication/confirmation-acknowledgement.html
17. Gmail keyboard shortcuts: https://support.google.com/mail/answer/6594
18. Linear, Peek: https://linear.app/docs/peek (page now 404; partly unverified)
19. W3C, Understanding SC 2.1.4 Character Key Shortcuts: https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html
20. Atlassian Design, drawer usage: https://atlassian.design/components/drawer/usage
21. Material Design 3, side sheets: https://m3.material.io/components/side-sheets/guidelines
22. WAI-ARIA APG, modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
23. Nielsen Norman Group, skeleton screens: https://www.nngroup.com/articles/skeleton-screens/
24. Atlassian Design, empty states: https://atlassian.design/foundations/content/designing-messages/empty-state
25. WAI-ARIA APG, grid: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
26. WAI-ARIA APG, sortable table: https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/
27. GOV.UK Design System, table: https://design-system.service.gov.uk/components/table/
28. USWDS, table: https://designsystem.digital.gov/components/table/
29. Das, Dang and Lease, HCOMP 2020: https://ojs.aaai.org/index.php/HCOMP/article/view/7461
30. Google Research, moderator wellbeing study: https://research.google/pubs/pub48642/
31. Psychological Research, 2026 blur and greyscale study: https://link.springer.com/article/10.1007/s00426-026-02241-5
32. TSPA curriculum, setting up a content moderator for success: https://www.tspa.org/curriculum/ts-fundamentals/content-moderation-and-operations/setting-up-a-content-moderator-for-success/
33. Hive, CSAM reports and moderation dashboards: https://thehive.ai/blog/streamline-csam-reports-with-moderation-dashboards-ncmec-integration
34. Didit, four-eyes case management: https://docs.didit.me/console/case-management/four-eyes
35. AFSP, Crisis Text Line myths: https://afsp.org/five-biggest-myths-crisis-text-line/
