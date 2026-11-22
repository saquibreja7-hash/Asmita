import { randomUUID } from "node:crypto";
import pg from "pg";
import { expect, type Browser, type Page } from "@playwright/test";
import { adminUrl, withAdmin } from "./database";
import { baseURL } from "./admin";

// Shared seeding for the review-console specs (review-console-spec.md
// WP141/WP142): one survivor case whose links are all flagged for human
// review, filed through the survivor's own flow so every row is honest.
// Every link is invented; nothing here touches real data.

export const FLAG_COUNT = 6; // > 5 unique domains is what flags the submission

// ---------------------------------------------------------------------------
// Serialisation between the review-console spec files. Playwright runs spec
// FILES in parallel; the review console is one shared queue system, and these
// specs assert exact queue counts, claim the oldest item, and change routing
// rules and queue access — all of which only mean anything if no other
// review spec is mid-flight. Each spec file takes this session-level
// Postgres advisory lock in beforeAll and releases it in afterAll, so the
// five files run one at a time (in whatever order workers grab them) while
// the rest of the suite keeps running in parallel.

const REVIEW_QUEUE_LOCK_ID = 715_517_651_9;
const LOCK_POLL_MS = 500;
const LOCK_WAIT_MS = 20 * 60_000;

let lockConnection: pg.Client | null = null;

/** Takes the review-console specs' shared queue lock (call from beforeAll). */
export async function acquireReviewQueueLock(): Promise<void> {
  const db = new pg.Client({ connectionString: adminUrl });
  await db.connect();
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const got = await db.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [
      REVIEW_QUEUE_LOCK_ID,
    ]);
    if (got.rows[0]?.locked) {
      lockConnection = db;
      return;
    }
    if (Date.now() > deadline) {
      await db.end();
      throw new Error("The review-console specs' shared queue lock never became free");
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }
}

/** Releases the shared queue lock (call from afterAll; a killed worker's connection frees it too). */
export async function releaseReviewQueueLock(): Promise<void> {
  const db = lockConnection;
  lockConnection = null;
  if (!db) return;
  await db.query("SELECT pg_advisory_unlock($1)", [REVIEW_QUEUE_LOCK_ID]).catch(() => undefined);
  await db.end();
}

/**
 * Cold start: the dev server compiles a route the first time it is asked
 * for, and a spec that pays a route's compile inside its own timeout can die
 * there — on a cold tree the filing chain alone can cost minutes. Spec files
 * call this from beforeAll, where no test's clock is running: every request
 * compiles its route and then fails fast on the missing session or CSRF,
 * which is all that is needed. Runs inside the file lock, so only the first
 * review file of a run pays anything.
 */
export async function warmConsoleRoutes(browser: Browser): Promise<void> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    for (const path of [
      "/register",
      "/submit",
      "/admin/review",
      "/admin/review/links/preview",
      "/admin/review/rules",
      "/admin/review/settings",
      "/admin/review/decisions",
      "/admin/review/metrics",
      "/admin/admins",
      "/admin/queue",
      "/admin/hashes",
    ]) {
      await page.goto(path).catch(() => undefined);
    }
    for (const path of [
      "/api/auth/request-otp",
      "/api/auth/verify-otp",
      "/api/cases/create",
      "/api/cases/warm-up/hashes",
      // WP145's bulk specs are the only callers of these two routes, so
      // without a warm-up their first-hit compile lands inside a test's
      // clock — and a cold route plus a busy dev server once pushed the
      // confirm POST past the client's 15-second abort (the spec then
      // waited 30 s for a "12 done" that could never arrive). In isolation
      // the 12-item reject answers in ~0.4 s; compiling here keeps it that
      // far away from every test's clock.
      "/api/admin/bulk/links",
      "/api/admin/bulk/fingerprints",
    ]) {
      await page.request.post(path, { data: {} }).catch(() => undefined);
    }
  } finally {
    await context.close();
  }
}

/**
 * The e2e database is shared and spec files run in parallel, so other specs
 * can leave flagged links waiting in the links queue. The console hands out
 * the OLDEST pending item first, so a spec that seeds its own case would
 * otherwise be handed someone else's link — its counts would be wrong and
 * its notes and decisions would land on a stranger's case. This resolves
 * every flagged link that is waiting right now (exactly the state the app's
 * own review leaves behind), closes its console job the way the sync's own
 * `closeJobAsResolvedElsewhere` does, and releases its claims, so the
 * calling spec's own seeds are the only items pending. Call it before
 * seeding, and again with the seeded case's id after seeding to clear
 * anything that arrived in between; it never touches that case's own links.
 */
export async function resolveLeftoverFlaggedLinks(options: { exceptCaseId?: string } = {}): Promise<void> {
  // Without exceptCaseId everything waiting is resolved; with it, the named
  // case's own links (and their jobs) are left exactly as they are.
  const subjectSql = options.exceptCaseId ? ` AND "caseId" <> $1` : "";
  const jobSql = options.exceptCaseId ? ` AND ("caseId" IS DISTINCT FROM $1)` : "";
  const params = options.exceptCaseId ? [options.exceptCaseId] : [];
  await withAdmin(async (db) => {
    // The leftover subjects stop awaiting review, exactly as the app's
    // reject path leaves them, so no later sync reopens their jobs.
    await db.query(
      `UPDATE "SubmittedUrl" SET status = 'REJECTED', "flaggedForReview" = false WHERE status = 'PENDING_REVIEW'${subjectSql}`,
      params,
    );
    // A system close_stale decision per leftover job, then the close and
    // the claim release: the same rows the sync writes, so the console's
    // invariants (one decision per closed job, no open claim on a closed
    // job) hold for this setup data too.
    await db.query(
      `INSERT INTO "ReviewDecision" (id, "jobId", "queueId", "subjectKind", "subjectId", "caseId", "reviewerEmailHash", decision, "reasonCode", "reasonNote", "claimedAt", "decidedAt", "auditEventId")
       SELECT gen_random_uuid()::text, id, "queueId", "subjectKind", "subjectId", "caseId", '', 'close_stale', NULL, NULL, NULL, now(), NULL
         FROM "ReviewJob" WHERE status = 'PENDING' AND "subjectKind" = 'FLAGGED_LINK'${jobSql}`,
      params,
    );
    await db.query(
      `UPDATE "ReviewJob" SET status = 'CLOSED', "closedAt" = now(), "closedReason" = 'resolved_elsewhere',
         "claimedBy" = NULL, "claimedUntil" = NULL, "updatedAt" = now()
       WHERE status = 'PENDING' AND "subjectKind" = 'FLAGGED_LINK'${jobSql}`,
      params,
    );
    await db.query(
      `UPDATE "ReviewJobClaim" c SET "releasedAt" = now(), outcome = 'released'
         FROM "ReviewJob" j
        WHERE j.id = c."jobId" AND j."subjectKind" = 'FLAGGED_LINK' AND j.status = 'CLOSED' AND c."releasedAt" IS NULL`,
    );
  });
}

/** One survivor case whose links are all flagged for human review. */
export async function seedFlaggedCase(page: Page): Promise<{ caseId: string; referenceNumber: string; links: string[] }> {
  await page.goto("/register");
  // The register form remembers an answered age check (sessionStorage) and
  // then skips the age step — a second seeding on the same page would hang
  // waiting for an age gate that is never shown again. Forget the previous
  // survivor's answers first, so every seeding walks the full honest flow.
  await page.evaluate(() => {
    window.sessionStorage.removeItem("asmita_eligibility");
    window.sessionStorage.removeItem("asmita_submit_draft");
  });
  await page.goto("/register");
  // The radios are disabled until the page hydrates (like the Continue
  // button), and check() by role waits for that: a blind click on the label
  // text can land before React attaches its handlers, the native toggle is
  // then reset by hydration, and the second question never appears — the
  // exact hang the WP172 verify run hit under full-suite load.
  await page.getByRole("radio", { name: "I am 18 years of age or older." }).check();
  await page.getByRole("radio", { name: "I was 18 or older." }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`review-${Date.now()}-${randomUUID().slice(0, 6)}@filing.example.com`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });

  // The first link is on a seeded platform (approvable); the rest are
  // invented hosts. Six unique domains trip the abuse check, so every link
  // waits in the flagged queue — the honest way a full queue arises.
  const links = [
    `https://youtube.com/watch?v=asmita-${randomUUID()}`,
    ...Array.from({ length: FLAG_COUNT - 1 }, (_, index) => `https://site-${index}.example.test/post/${randomUUID()}`),
  ];
  await page.getByLabel("Links where the content appears").fill(links.join("\n"));
  await expect(page.locator("#url-checks")).toBeVisible();
  await page.getByText(/I declare that I am the person depicted/).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  // The invented hosts are unknown platforms, so the review step is the
  // investigation variant; the seeded-platform link is still included.
  await expect(page.getByRole("heading", { name: "Request help with an unknown platform" })).toBeVisible();
  const created = page.waitForResponse((response) => response.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Submit request for investigation" }).click();
  const body = (await (await created).json()) as { caseId: string; referenceNumber: string };
  await expect(page).toHaveURL(/\/case\/|\/confirmation|\/handoff\//, { timeout: 30_000 }).catch(() => undefined);
  return { ...body, links };
}
