# Review console: what we borrow from Coop

Status: owner-approved for build, 22 November 2026 (Saquib). Built by Hermes on win-desktop, WP140 to WP145, one after another on branch `feat/admin-review-console`. Progress goes in `docs/product/review-console-progress.md`.

## In one paragraph

ROOST's Coop (github.com/roostorg/coop, Apache-2.0) is the open-source moderation console used by Notion, Kyodo and others. We studied its review queues, routing rules, review screen, roles, decision log and metrics. We do not run Coop and we do not copy its code: its stack (Apollo GraphQL, Redis/BullMQ, Scylla, ClickHouse) does not fit a Worker with Postgres, and its review screen shows media, which our complaint workflow never does. We borrow its **ideas**: a single review loop where an operator presses "Start reviewing" and gets the next item with a lease, a sticky decision panel with reasons, per-reviewer skip, oldest-age colours, routing rules that pick the queue, a decisions log with CSV, time-to-review and handle-time metrics, queue access by role, and an Admins page. This finishes Phase 4 of `docs/product/admin-console-redesign.md` (assignment, notes, admins page) in a shape that scales to a team.

## What exists today (read before building)

The redesign doc's Phases 0 to 3 are largely built. Read these before writing code:

- Home `src/app/admin/page.tsx` ("Needs action" tiles) and `summariseQueues` / `NextActionKind` in `src/lib/admin-cases.ts`.
- Case list and page: `src/app/(admin)/cases/*`, `src/app/admin/cases/*`, `src/lib/admin-cases.ts`, saved views `src/lib/admin-saved-views.ts`.
- Flagged links: `src/app/(admin)/flagged/*`, `src/app/admin/queue/page.tsx`, `src/app/api/admin/review-queue/[caseId]/[urlId]/approve` (and reject), bulk `src/app/api/admin/bulk/links/route.ts`.
- Fingerprints: `src/app/(admin)/hashes/*`, `reviewHashSubmission` and `listHashReviewQueue` in `src/lib/hash-submission.ts`, `src/app/api/admin/hashes/[hashId]/approve|reject`.
- Crawler findings: `src/app/(admin)/findings/*`, `reviewCrawlFinding`, `applyFindingLabel` (including "Possible minor") in `src/lib/crawl-findings.ts`, `src/app/api/admin/findings/[id]/review`.
- Partner applications: `src/app/(admin)/partners/ApplicationsManager.tsx`, `src/app/api/admin/partners/applications/[applicationId]`.
- AI Lab reports: `src/app/admin/lab/reports/page.tsx` and `src/lib/lab/*` (Lab, not complaint workflow).
- Auth and roles: `src/lib/auth/admin-permissions.ts`, `require-admin.ts`, `admin-enrolment.ts`, `admin-mfa*.ts`, `POST /api/admin/mfa/reset`.
- Audit: `src/lib/audit*`, `AuditLog`, `AdminAccessLog`; the audit page `src/app/admin/audit/page.tsx`.
- Nav: `src/app/(admin)/admin-nav.ts`. Styles: `src/app/(admin)/admin.css`.

## The single most important rule

**The review console is a new way to reach the decisions that already exist. It never adds a new way to approve, reject, dispatch or label.** Every decision button calls the existing library function (`reviewHashSubmission`, `reviewCrawlFinding`, the flagged-link approve/reject logic, `applyFindingLabel`, the partner-application decision), with the same permission check and the same audit event it has today, and then records a `ReviewDecision` row that points at it. If a decision cannot be expressed through an existing function, it is out of scope: write the gap in progress.md.

## 0. Rules for every WP

1. **Read first:** root `CLAUDE.md` (Safety Principles and "Scope of the constraints below"), `asmita/AGENTS.md`, `asmita/DESIGN.md`, this spec, `docs/product/admin-console-redesign.md`, and the files in "What exists today" that your WP touches. Consult `asmita/node_modules/next/dist/docs/` before framework code.
2. **This is complaint-workflow work.** Flagged links, fingerprints, crawler findings and survivor cases are survivor case data. The Safety Principles apply in full:
   - No media, ever. The console shows no image, thumbnail, preview or fetched page. Addresses stay masked text; the existing Reveal flow (reason required, `AdminAccessLog`, audit) is the only way to see one, and the review screen links to it rather than re-implementing it.
   - Dispatch gates are untouched. Routing rules, the review loop and bulk actions **never** dispatch a notice, never set `reviewedByLegal`, never set `lastContactVerifiedByHuman`, never approve automatically. A rule only chooses a queue and a priority.
   - **Minors.** Anything labelled "Possible minor", or any case whose survivor is under 18, goes to the protected queue `minor-hold` before any routing rule runs, is visible only to SUPER_ADMIN, and offers no decision that continues the adult flow. No rule can route it elsewhere. Test this.
   - No survivor PII or URL plaintext in jobs, decisions, CSV exports, logs or tests. Store ids; render masked text through the existing helpers.
   - AI Lab reports are Lab work (the complaint constraints do not apply to them), but they share the same queue machinery; keep the ESLint boundary between lab and complaint modules: queue code must not import lab modules directly. Use a small adapter registered from the Lab side.
3. **Public repo.** No secrets, real addresses, real people or real platform contacts in code, tests, fixtures or docs. Fixtures use `example.test` and invented names.
4. **Data.** Prisma migrations are additive only (new tables, new nullable columns, new enum values). Every new table needs: the Prisma model, the migration, the Kysely path for the Worker (`src/lib/worker-kysely.ts`, generated types; never hand-write `src/generated/`), the Prisma path for Node, and the in-memory path for local dev without `DATABASE_URL` (follow the dual-backend pattern used by `admin-saved-views.ts`). Transactions must work on Hyperdrive.
5. **Design.** Follow `asmita/DESIGN.md` and the existing `admin.css`: white page, teal actions, orange markers, 12px corners on buttons and boxes, **no coloured left-border stripes**, no label above headings, English only in admin. Use the impeccable skill for every page layout and check it at 1280px and 390px.
6. **Accessibility.** Every control reachable by keyboard; visible focus; shortcuts suppressed while typing in an input, textarea, select or contenteditable; a `?` sheet listing them; an off switch stored per admin; never rely on colour alone (age colours also carry text).
7. **Quality.** Vitest for every behaviour (memory backend always; Prisma and Kysely where the repo already tests both). Playwright specs for the main flows, written carefully: this machine has no Playwright or Postgres, the e2e run happens later on dev-vm. Never weaken, skip or delete a test. Lint, type-check and the unit suite must pass.
8. **Commits:** clear messages ending with `Co-Authored-By: Hermes (GLM 5.3) <noreply@example.invalid>`. Do not push from inside the session; the lane pushes after checks pass.
9. **Never ask the user anything.** When something is unclear, choose what best fits this spec and the existing code, carry on, and record the decision in progress.md.

---

## WP140 — Review jobs: data model, lease claim and decisions (no UI)

### Model

Add to `prisma/schema.prisma` (one migration):

- `ReviewQueue { id String @id, key String @unique, name, description String?, subjectKind ReviewSubjectKind, isDefault Boolean @default(false), protected Boolean @default(false), sortOrder Int, requireReasonOnReject Boolean @default(true), requireReasonOnApprove Boolean @default(false), createdAt, updatedAt }`
- `enum ReviewSubjectKind { FLAGGED_LINK, FINGERPRINT, FINDING, PARTNER_APPLICATION, LAB_REPORT }`
- `ReviewJob { id String @id @default(cuid()), queueId, subjectKind, subjectId String, caseId String?, status ReviewJobStatus @default(PENDING), priority Int @default(0), claimedBy String? /* admin email hash */, claimedUntil DateTime?, enqueueSource ReviewEnqueueSource, routedByRuleId String?, routedByRuleVersion Int?, createdAt, updatedAt, closedAt DateTime?, closedReason String? }`
  - `enum ReviewJobStatus { PENDING, CLOSED }`, `enum ReviewEnqueueSource { SYNC, RULE, MOVED, MANUAL }`.
  - **One open job per subject:** a partial unique index on `(subjectKind, subjectId) WHERE status = 'PENDING'` (raw SQL in the migration; document it). A second enqueue of the same subject updates the existing job instead of creating one (Coop's "merge into the existing job").
  - Indexes: `(queueId, status, priority DESC, createdAt)`, `(caseId)`, `(claimedBy, status)`.
- `ReviewDecision { id, jobId String @unique, queueId, subjectKind, subjectId, caseId String?, reviewerEmailHash String /* "" for system */, decision String /* e.g. approve, reject, possible_minor, move, close_stale */, reasonCode String?, reasonNote String? /* encrypted with encryptField, never sent anywhere */, claimedAt DateTime?, decidedAt DateTime, auditEventId String? }`. `jobId` unique makes a retried submit idempotent.
- `ReviewJobClaim { id, jobId, reviewerEmailHash, claimedAt, releasedAt DateTime?, outcome String? /* decided | skipped | expired | released */ }` (handle-time metrics).
- `ReviewSkip { reviewerEmailHash, jobId, until DateTime, @@id([reviewerEmailHash, jobId]) }`.

Seed the system queues in a migration-safe way (idempotent upsert in `prisma/seed.ts` and an on-demand `ensureSystemQueues()`), keys and order: `links` (Flagged links, FLAGGED_LINK, default), `fingerprints` (FINGERPRINT, default), `findings` (Crawler findings, FINDING, default), `partners` (Partner applications, default), `lab-reports` (Lab reports, default), `minor-hold` (Possible minor, protected, any kind). Each kind has exactly one default queue.

### Library `src/lib/review-jobs.ts`

- `syncReviewJobs(now)`: reconciles jobs with the source of truth. **The source tables stay authoritative.** For each kind, find subjects that need a human (the same predicates the current pages use: flagged links awaiting review, fingerprints `PENDING_REVIEW`, findings awaiting review, pending partner applications, open lab reports) and enqueue those without an open job; close open jobs whose subject no longer needs review (`closedReason: "resolved_elsewhere"`, `ReviewDecision` with `reviewerEmailHash ""` and decision `close_stale`). Run it from the existing `maintenance` cron and lazily (throttled to once per 30 s per isolate) when a review page loads. Also call `enqueueForReview(kind, id)` at the places where a subject first enters review, so jobs appear without waiting for the sync.
- Minor check runs first: subjects with a "Possible minor" label or a case whose survivor is under 18 go to `minor-hold` regardless of anything else, and an open job elsewhere is moved there.
- `claimNextJob({ queueId, reviewerEmailHash, now })`: one statement, Postgres:
  `UPDATE "ReviewJob" SET "claimedBy" = $me, "claimedUntil" = now() + interval '10 minutes' WHERE id = (SELECT id FROM "ReviewJob" WHERE "queueId" = $q AND status = 'PENDING' AND ("claimedUntil" IS NULL OR "claimedUntil" < now() OR "claimedBy" = $me) AND id NOT IN (SELECT "jobId" FROM "ReviewSkip" WHERE "reviewerEmailHash" = $me AND until > now()) ORDER BY ("claimedBy" = $me) DESC NULLS LAST, priority DESC, "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`.
  A reviewer who already holds a job gets the same one back (refresh-safe). Write a `ReviewJobClaim` row. Memory backend: same semantics, single-threaded.
- `extendClaim(jobId, me)`: +10 minutes, only if still held by me (the review page heartbeats every 4 minutes while visible).
- `skipJob(jobId, me)`: insert `ReviewSkip` for 30 minutes, release the lease, claim outcome `skipped`.
- `releaseJob(jobId, me)`.
- `decideJob({ jobId, me, decision, reasonCode?, reasonNote? })`:
  1. Load the job; it must be PENDING and held by `me` with an unexpired lease (else 409 `claim_lost`).
  2. Validate the decision against the queue's allowed decisions (see WP142) and reason requirements (400 `reason_required`).
  3. Call the **existing** decision function for the subject kind through a typed adapter map `reviewAdapters[kind] = { decisions, permission, decide(subjectId, decision, ctx) }`. The adapter performs the existing permission check and existing audit event.
  4. In one transaction where the backend allows: insert `ReviewDecision`, close the job, close the claim. A unique violation on `ReviewDecision.jobId` returns the earlier result (idempotent retry).
  5. If the existing function fails, the job stays open and the error is returned unchanged.
- `moveJob(jobId, me, toQueueId, note?)`: records decision `move`, closes the job, opens a new job in the target queue with `enqueueSource MOVED`. Moving out of `minor-hold` is refused.
- `queueSummaries(viewer)`: per visible queue, `pending`, `oldestCreatedAt`, `pastFourHours`, `pastDay`, `heldByMe`.

### API

`POST /api/admin/review/[queueKey]/claim`, `POST /api/admin/review/jobs/[jobId]/{extend,skip,release,decide,move}`, `GET /api/admin/review/summary`. CSRF and admin auth like the other admin routes; Zod-validated bodies; `cases:read` to see complaint queues, the adapter's permission to decide, `lab:manage` for lab reports, SUPER_ADMIN for `minor-hold`.

### Tests

Lease (two reviewers never get the same job; expiry hands it over; same reviewer gets it back), skip hides only for that reviewer for 30 minutes, dedup of open jobs per subject, sync opens and closes correctly for each kind, minor-hold precedence and the refusal to move out, idempotent decide, `claim_lost`, adapters call the existing functions (spy) and do not bypass their permission checks, no URL plaintext in any job or decision row.

---

## WP141 — The review loop UI

Add a "Review" group at the top of the admin nav, under "Needs action": **Review** (`/admin/review`).

1. **`/admin/review`** — the queue list. One row per queue the viewer may see, in `sortOrder`: name, description, pending count, oldest age as text plus colour (under 4h neutral, 4h to 24h orange `--coral`, over 24h red text with "over a day" wording so colour is never the only signal), "N held by you", and a **Start reviewing** button (disabled with the reason "Nothing to review" at 0). A **Preview** link per queue lists its pending jobs (subject summary, case reference, created, priority, who holds it) without claiming any. Poll counts every 15 s while the tab is visible. The "Needs action" tiles link here for the four review kinds.
2. **`/admin/review/[queueKey]`** claims the next job and redirects to **`/admin/review/[queueKey]/[jobId]`**. Refreshing keeps the claim.
3. **The job screen** (two columns at ≥1024px, stacked below):
   - **Left, scrolling:** what the item is, in the words the current page for that kind uses: for a flagged link the case reference, platform, masked address, flag reason, submitted time; for a fingerprint the case reference, algorithm, quality, status; for a finding the distance, method, quality, consent scope, labels and the masked address with the existing Reveal button; for a partner application its fields; for a lab report its fields. Then **context**: the case's other open jobs (queue, age), the case timeline (reuse the case page component), previous decisions on this case (reviewer shown as "You" or a short handle, never an email), and internal notes (WP142).
   - **Right, sticky 320px decision panel:** "Guidance" button (opens the queue's guidance drawer, WP142), **Skip**, "N left in this queue", the decision buttons for this kind (from the adapter), a reason picker and note (WP142), and **Submit**, disabled with a tooltip that says why ("Choose a reason"). After a submit the next job loads automatically; when the queue is empty show the empty state: a check icon, "You're all caught up", and a link back to the queue list.
   - **Lease:** heartbeat every 4 minutes while visible; if the claim is lost, show "Someone else has this now" with a button to get the next one; never submit on a lost claim.
4. **Keyboard:** `1`–`9` choose the decision in order, `r` focuses the reason, `Enter` with Ctrl/Cmd submits, `s` skips, `g` opens guidance, `?` opens the shortcuts sheet, `Esc` closes drawers. Suppressed while typing. An off switch in the sheet, stored per admin (localStorage, wrapped in try/catch).
5. **Existing pages stay.** Flagged, Fingerprints and Findings keep working; add a "Review one by one" button on each that opens the matching queue. Do not delete them in this WP.

Tests: component tests for the decision panel states and keyboard suppression; Playwright: start reviewing a flagged-link queue seeded with two invented items, approve one with a reason, skip the other, see the empty state; a lost-claim flow; minor-hold invisible to CASE_REVIEWER.

---

## WP142 — Reasons, guidance and internal notes

1. **Reasons.** `ReviewReason { id, queueKey, decision, code, label, active, sortOrder }`, seeded per kind with plain, factual reasons. Seeds for flagged links reject: "Not a link to the reported content", "Duplicate of another link", "Platform not covered", "Survivor asked to withdraw", "Other (explain)"; fingerprints reject: "Low quality", "Duplicate", "Survivor asked to withdraw", "Other (explain)"; findings reject: "Not the same image", "Already reported", "Outside consent scope", "Other (explain)". "Other" requires a note. The queue flags `requireReasonOnReject` / `requireReasonOnApprove` are enforced on the server in `decideJob`, not only in the UI. SUPER_ADMIN can add, rename, reorder and deactivate reasons at `/admin/review/settings` (never delete a reason that a decision uses). These reasons are internal: they are never sent to platforms or survivors and never appear in notices.
2. **Guidance.** One Markdown file per queue in `docs/review-guidance/<queueKey>.md`, rendered read-only in the guidance drawer (server-side, sanitised). Write first drafts from what the code and existing docs already say (the `SafetyNote` text for findings, the flag reasons for links); mark each file "Draft: not reviewed" at the top and list them in progress.md for the owner. Do not invent legal advice or citations.
3. **Internal notes.** `CaseNote { id, caseId, jobId String?, authorEmailHash, bodyEncrypted, createdAt, deletedAt DateTime? }` (this is the `CaseNote` the redesign doc's Phase 4 describes). Written with `cases:note`, encrypted with `encryptField`, shown on the job screen and the case page, newest first, soft-deleted by the author or SUPER_ADMIN with an audit event `CASE_NOTE_DELETED` (add `CASE_NOTE_ADDED` too; enum additions). Never sent anywhere, never in exports, 2000 characters max, Enter posts and Shift+Enter adds a line.

Tests: reason enforcement on the server per queue flag; inactive reasons hidden but old decisions still show their label; notes encrypted at rest, permission-checked, soft delete audited; guidance rendering escapes HTML.

---

## WP143 — Routing rules

Coop sends each new job through ordered rules; the first match picks the queue. We do the same, for complaint and lab kinds, with strict limits.

1. **Model.** `ReviewRoutingRule { id, name, description?, subjectKind, sequence Int, condition Json, destinationQueueId, priority Int @default(0), status ReviewRuleStatus /* DRAFT | LIVE | DISABLED */, version Int, createdBy, createdAt, updatedAt }` plus `ReviewRoutingRuleVersion` (append-only copy of every saved version). `ReviewRoutingLog { jobId, ruleId?, ruleVersion?, matched Boolean, details Json, createdAt }` keeps the per-job evaluation ("why is this here").
2. **Conditions.** `condition` is `{ all: Leaf[] } | { any: Leaf[] }` (one level; no nesting in v1). A `Leaf` is `{ field, op, value }` with `op` in `eq | neq | lt | lte | gt | gte | in | is_empty`. Fields are a fixed, typed allowlist per kind, read from existing columns only, with **no free text from survivors and no URLs**:
   - FLAGGED_LINK: `platformTier`, `platformKey`, `urlSource`, `flagReason`, `caseMode`, `ageHours`.
   - FINGERPRINT: `algorithm`, `quality`, `caseMode`, `ageHours`.
   - FINDING: `method` (PDQ, vPDQ, SSCD), `distance`, `quality`, `consentScope`, `sourceKind`, `labels`, `ageHours`.
   - PARTNER_APPLICATION: `platformTier`, `ageHours`. LAB_REPORT: fields the Lab adapter exposes.
   Unknown fields or wrong types are rejected on save.
3. **Evaluation.** In `enqueueForReview` and `syncReviewJobs`: minor check first (always `minor-hold`), then LIVE rules of that kind in `sequence` order; the first match sets queue and priority; no match uses the kind's default queue. DRAFT rules are evaluated too and logged as "would have matched" without effect (shadow mode). Log every evaluation in `ReviewRoutingLog` and show it on the job screen as "Routed here by rule X (version N)" or "Default queue".
4. **What a rule can never do:** decide, approve, reject, dispatch, label, send email, change a gate, route out of or into `minor-hold`, or choose a queue of another kind. Enforce in code and test each one.
5. **UI** `/admin/review/rules` (permission `review:manage`, new, SUPER_ADMIN only): a list of rules per kind as cards in sequence order with the default queue pinned last and not editable; edit inline with a structured builder (field, operator, value controls typed per field); "Move up" / "Move down" buttons for order (accessible; drag-and-drop optional on top); status switch; version history with who and when; and a **Test** panel that takes either an existing open job id or hand-entered field values and shows each rule's result per condition and the queue it would choose. Saving creates a new version; every save and status change writes an audit event (`REVIEW_RULE_CHANGED`, enum addition).
6. **Queues admin** on the same page: SUPER_ADMIN can add custom queues per kind (name, description, sort order, reason flags), rename them and archive empty ones. System queues cannot be archived; `minor-hold` cannot be edited.

Tests: evaluation order and first match, default fallback, shadow DRAFT logging, minor precedence, field allowlist and type validation, every "never" in point 4, version append-only, audit events.

---

## WP144 — Queue access, Admins page and step-up MFA

1. **Queue access.** `ReviewQueueAccess { queueId, role AdminRole?, adminEmailHash String? }` (one of the two set). A queue with no rows is visible to every role that has the adapter's permission (today's behaviour). Rows narrow it: a reviewer sees a queue if their role or their own entry is listed. `minor-hold` is always SUPER_ADMIN only and ignores rows. Enforce in `queueSummaries`, `claimNextJob`, the job page and every job API.
2. **Admins page** `/admin/admins` (`users:manage`): list admins from the allowlist and `AdminProfile` (handle, role, MFA enrolled yes/no, last sign-in, queues they can reach); issue a one-time enrolment code and reset MFA using the existing `POST /api/admin/mfa/reset` behaviour; change a role if the current model stores roles in the database (if roles come only from env, show them read-only and say where to change them; do not invent a new source of truth without recording the decision). Show each role's permissions as a read-only matrix generated from `admin-permissions.ts`. Every change writes an audit event. Never show full email addresses in lists: show a handle or masked form.
3. **New permission** `review:manage` (SUPER_ADMIN only) for rules, queues, reasons and access.
4. **Step-up MFA** (from the redesign doc, Phase 4): add an `mfaAt` claim to the admin session; these actions require `mfaAt` within 15 minutes or ask for a fresh authenticator code first: changing routing rules, queue access, roles, issuing enrolment codes, MFA reset, and bulk decisions over 10 items. `POST /api/admin/mfa/step-up`. Respect `DEV_SKIP_ADMIN_MFA` only through `src/lib/dev-flags.ts`.

Tests: access narrowing by role and by person, minor-hold override, admins page permission, masked emails, step-up required and expiry, dev flag only through dev-flags.

---

## WP145 — Decisions log, review metrics and safer bulk actions

1. **Decisions log** `/admin/review/decisions` (`audit:read`): `ReviewDecision` newest first, keyset paginated; filters for queue, kind, decision, reviewer, reason, date range, case reference; each row links to the case and shows the routing explanation. **CSV export** of the filtered set with: decided at (IST), queue, kind, decision, reason label, reviewer handle, case reference, claim-to-decision seconds. No URLs, no notes, no PII. Export writes an audit event.
2. **Metrics** on `/admin/review/metrics` (`metrics:read`), Postgres `date_trunc` group-bys, day or week buckets, last 7/30/90 days: jobs created, open now, **median and p90 time to first review** (job created to decided), **median handle time** (claim to decision), decisions by queue and by reviewer, skips by queue, jobs closed as resolved elsewhere, oldest open per queue. Plain tables plus simple bar charts in the existing admin chart style; label every number; show "Not enough data" under 5 items rather than a misleading figure.
3. **Bulk safety.** Extend the existing bulk links route and add the same for fingerprints: a confirm step that states the exact count and the decision, type-to-confirm (type the count) above 10 items, maximum 50, per-item results with failures listed, one `ADMIN_BULK_ACTION` audit event plus the existing per-item events, a `ReviewDecision` per item (closing its job). Dispatch is never a bulk action.
4. **Wellness.** Not borrowed: the console shows no media, so Coop's blur and greyscale settings have nothing to act on. Record this in progress.md so nobody adds media to make them useful.

Tests: filters and keyset paging, CSV columns and the absence of URLs and notes, metric maths on fixed fixtures (including the small-sample rule), bulk confirm, type-to-confirm, limit, per-item audit.

---

## Not in scope

- Running Coop or Osprey, Coop's GraphQL API, Redis queues, ClickHouse.
- Media display of any kind, blur settings.
- Automatic decisions of any kind (Coop's proactive rules, strikes, retroaction).
- A Coop integration package for platform partners (a separate piece of work: it would let platforms that run Coop pull Asmita's fingerprint feed into a Coop matching bank).

## Order and machine

win-desktop, one lane at a time, in order WP140, WP141, WP142, WP143, WP144, WP145, all on `feat/admin-review-console`. win-desktop runs lint, type-check and vitest only. Playwright, the Postgres e2e suite and the Worker smoke run afterwards on dev-vm before any PR. The PR waits for the owner.
