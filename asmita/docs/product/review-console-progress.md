# Review console progress

One entry per work package of `review-console-spec.md`, appended by the lane that built it.

### WP140 done

Review jobs: the data model, the lease claim and the decisions, with no UI. Built by Hermes on win-desktop, 22 November 2026.

**What was built**

- **Data model** (migration `20261122100000_review_jobs`, additive only, RLS on every table like `20261119150000_partner_feed`): `ReviewQueue`, `ReviewJob`, `ReviewDecision`, `ReviewJobClaim`, `ReviewSkip`, plus the `ReviewSubjectKind`, `ReviewJobStatus` and `ReviewEnqueueSource` enums. One open job per subject is a partial unique index (`subjectKind, subjectId WHERE status = 'PENDING'`), written as raw SQL in the migration because Prisma cannot express it; a second enqueue merges into the open job. The six system queues are seeded create-only by `prisma/seed.ts` and on demand by `ensureSystemQueues()` (`src/lib/review-queue-seeds.ts` is the one source for both).
- **Library** `src/lib/review-jobs.ts`, on all three backends (memory, Kysely on the Worker, Prisma): `syncReviewJobs` (the source tables stay authoritative; opens, closes as `resolved_elsewhere` with a system `close_stale` decision, and moves jobs between queues), `claimNextJob` (one raw `UPDATE ... FOR UPDATE SKIP LOCKED` statement on Postgres, exactly the spec's, plus a `ReviewJobClaim` row; the memory backend has the same semantics single-threaded), `extendClaim`, `skipJob` (30 minutes, this reviewer only), `releaseJob`, `decideJob` (server-side reason enforcement, idempotent retry, one transaction for the decision, the job closure and the claim closure), `moveJob` (decision `move`; moving out of minor-hold refused), `queueSummaries`, and the throttled `maybeSyncReviewJobs` (once per 30 s per isolate). The sync runs from the existing maintenance cron, which now also reports `{enqueued, closed, moved}`.
- **Adapters** `src/lib/review-adapters.ts`: a typed map per subject kind that transcribes today's routes — the same permission, the same existing library function, the same follow-ups (the fingerprint reject voids signatures and the fingerprint approve sends the signed hash advisory, both exactly as `src/app/api/admin/hashes/[hashId]/*` does). `src/lib/lab/lab-review-adapter.ts` registers the Lab's adapter from the Lab side; queue code never names a lab function. Decisions offered: links approve/reject, fingerprints approve/reject, findings approve/dismiss/label_possible_minor, partner applications contacted/approve/decline, lab reports send_email/send_web_form.
- **Minor check first**: a finding under a "Possible minor" label goes to the protected `minor-hold` queue whatever else is true (an open job elsewhere is moved and its lease released), `minor-hold` is SUPER_ADMIN-only in `queueSummaries`/claim/decide/move and every job route, and no decision or move can act on a job inside it; the console's `label_possible_minor` closes the adult-queue job and reopens the subject in minor-hold in one transaction. When the label is cleared through the existing second-admin flow, the sync moves the subject back to its kind's queue.
- **API**: `POST /api/admin/review/[queueKey]/claim`, `POST /api/admin/review/jobs/[jobId]/{extend,skip,release,decide,move}`, `GET /api/admin/review/summary` — CSRF and admin auth like the other admin routes, Zod bodies, `cases:read` to see the complaint queues, the adapter's permission to decide, `lab:manage` for lab reports, SUPER_ADMIN for `minor-hold`.
- **Entry points** open a job the moment a subject enters review (flagged links in `addUrlsToCase`, fingerprints in `addHashesToCase`, findings in `recordCrawlFindings`, partner applications in `recordPartnerApplication`, lab drafts in `draftLabReport`); every hook is best-effort, and the sync backfills.
- **Memory-path gaps closed** so the console's dev/test backend works: `reviewHashSubmission` and case-ops `reviewSubmittedUrl` gained memory twins (both were database-only), and `listHashReviewQueue` gained a memory branch. The dev hashes page and the flagged single buttons could not work without a database before this.

**What was verified, and how**

- Vitest, 60 new tests in four files: `tests/unit/review-jobs.test.ts` (memory backend: the lease — two reviewers never share a job, an expired lease is handed over, a refresh returns the same job; the reviewer-scoped 30-minute skip; one open job per subject; the sync opening and closing for every kind; minor-hold precedence and the refusal to move out; idempotent decide; `claim_lost`; reason enforcement; queue visibility per role; no address in any job, decision, claim or skip row, and the reason note stored encrypted), `tests/unit/review-adapters.test.ts` (every adapter calls the existing function with today's arguments — spies — and refuses a role without its permission before anything runs; the existing functions' refusals pass through unchanged), `tests/unit/review-jobs-kysely.test.ts` (the Worker path against a recording fake: the one-statement claim with the ReviewSkip subquery and FOR UPDATE SKIP LOCKED, the decide/move/sync transactions behind the PENDING guard), `tests/unit/review-jobs-prisma.test.ts` (the Node path against a mocked client: the same claim statement with its parameters, the decide transaction, the idempotent retry, the create-only queue seeding).
- The full local suite passes: 2366 tests, lint 0 errors, `tsc --noEmit` clean, `prisma validate` and `prisma generate` clean, and `C:\hermes\check.ps1 -Scope asmita` ends with ALL CHECKS PASSED.

**Not verified on this machine**

- No Postgres here: the migration's SQL (including the partial unique index and the RLS policies), the `FOR UPDATE SKIP LOCKED` claim against a real database, and Kysely transactions over Hyperdrive never actually ran. They run on dev-vm (the Postgres e2e suite and the Worker smoke) before the PR.
- No Playwright here: WP140 has no UI and the spec's WP140 test list names no e2e spec, so none was written; the review loop's e2e specs come with WP141.

**Sentences the owner should approve (user-facing behaviour)**

- A reviewer pressing "Start reviewing" gets one item at a time with a 10-minute lease; a refresh keeps it, an expired lease hands it to a colleague, and nobody can decide an item someone else holds.
- A rejection or any other decision from the console records its reason internally, encrypted; it never reaches the survivor, whose link shows the same empty flag reason as today's one-click buttons on the Flagged page.
- Approving a fingerprint from the console sends the survivor's signed hash advisory to the platforms she chose, exactly as the Fingerprints page does today; the console adds no new path, it presses the same button.
- An analyst who suspects a minor can press "Label Possible minor" from the console: the item leaves the adult queue at once, only a SUPER_ADMIN sees it again, and it comes back only through the existing two-person label-clearing flow.

**Decisions made on this lane**

1. `ReviewQueue.subjectKind` is nullable: null means "any kind", which is how `minor-hold` accepts every subject kind. The spec's five `ReviewSubjectKind` values are unchanged.
2. Flagged-link jobs use `isAwaitingReview` (the predicate the review buttons enforce) rather than the Flagged page's broader display predicate, so a job never opens for a link its own button would refuse (a flagged link already removed or rejected).
3. The minor check keys on the finding's "Possible minor" label only: no case carries an under-18 field, because a minor never reaches case creation (the eligibility gate refuses before any row exists). When a case-level minor flag is ever added, it belongs in `queueForSubject`.
4. `ReviewDecision.auditEventId` stays null for now: `writeAuditLog` cannot return the id of the row it wrote. The existing functions' audit events remain the audit record; the field is there for when the audit writer can report ids.
5. Console reasons are internal (WP142's rule, applied from WP140): the flagged-link and fingerprint adapters never pass their note as the row's `flagReason`, because the survivor sees the link one and WP142 forbids sending reasons out.
6. The fingerprint adapter mirrors the existing approve/reject routes completely — including the signature voiding after a rejection and the signed-advisory dispatch after an approval — so console behaviour is identical, not a subset and not a new dispatch path.
7. The Lab adapter's send-by-email uses the chokepoint's own abuse address (the Lab page's prefill rule); an address that is not an email answers `no_abuse_email` and the analyst uses the AI Lab page, where the address is typed.
8. The Lab's adapter registers from the Lab side, and the queue code loads that module lazily — the one sanctioned seam, because registration only from Lab pages would leave lab jobs undecidable in a fresh Worker isolate. The enforced boundary holds: the repo's lint passes with the seam in place, and nothing outside the Lab names a lab function.
9. `skipJob`/`releaseJob`/`extendClaim` require the caller's own lease; `moveJob` does not (a SUPER_ADMIN may move an unclaimed job, e.g. into minor-hold), and any move releases the lease the job had.
10. A first approval that still needs a second analyst records no `ReviewDecision` (`jobId` is unique per decision) and releases the lease; the existing function's own audit entry is the record of the first approval.
11. The lazy sync swallows its own failure with a fixed log code and waits for the next window; the maintenance cron is the reliable run and reports its counts.

