import { expect, test } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";
import {
  acquireReviewQueueLock,
  releaseReviewQueueLock,
  resolveLeftoverFlaggedLinks,
  seedFlaggedCase,
  warmConsoleRoutes,
} from "./support/review";

// Review console WP143 (review-console-spec.md): routing rules. The owner
// builds a custom queue and a rule in the structured builder, tests it with
// hand-entered values, and a freshly filed flagged link is routed into the
// custom queue with the rule's priority — while nothing is decided, sent or
// labelled anywhere. The reviewer role never sees the rules page. These
// specs run on dev-vm against the throwaway Postgres; every link and name
// below is invented, and the specs assert the submitted links never appear
// in any routing row.

// Spec files run in parallel and the review console is one shared queue
// system: this file-level lock serialises the review-console specs against
// each other while the rest of the suite keeps running in parallel, and the
// warm-up compiles the routes before any test's clock runs.
test.beforeAll(async ({ browser }) => {
  // The lock may wait for another review-console file (up to its 20-minute
  // limit), then the warm-up compiles the console routes: far past the
  // default 30 s hook timeout.
  test.setTimeout(22 * 60_000);
  await acquireReviewQueueLock();
  await warmConsoleRoutes(browser);
});
test.afterAll(async () => {
  // A live rule is shared state: the first test switches its own rule off
  // through the page as its last step, but a failure or timeout anywhere
  // before that would leave it routing every later spec's seeded-platform
  // links out of the default queue. Whatever happened, this file leaves no
  // live rule behind.
  await withAdmin(async (db) => {
    await db.query(`UPDATE "ReviewRoutingRule" SET status = 'DISABLED' WHERE status = 'LIVE'`).catch(() => undefined);
  });
  await releaseReviewQueueLock();
});

test("a live rule routes a freshly filed link into a custom queue, and the console explains why", async ({ browser, page }) => {
  // Two full filings plus the builder and the Test panel on the dev server:
  // this spec is the longest in the file and needs the room.
  test.setTimeout(600_000);
  // The links queue is shared: earlier files leave pending links behind, and
  // a live TIER_1 rule would sweep their seeded-platform jobs into the
  // custom queue too. Resolve the leftovers first so this spec's own two
  // cases are the queue's whole world.
  await resolveLeftoverFlaggedLinks();
  // One case before any rule exists, so the sync's re-routing is also
  // exercised: its links start in the default queue.
  await seedFlaggedCase(page);

  const owner = await adminContext(browser, "e2e-admin");
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/admin/review/rules");

  // Queues admin: a custom queue for flagged links.
  const queuesSection = ownerPage.getByRole("region", { name: "Queues" });
  await queuesSection.getByRole("button", { name: "Add a queue" }).click();
  await queuesSection.getByLabel("Name").fill("Big platforms");
  await queuesSection.getByLabel("For kind").selectOption("FLAGGED_LINK");
  await queuesSection.getByRole("button", { name: "Add queue" }).click();
  await expect(queuesSection.getByText("big-platforms")).toBeVisible({ timeout: 30_000 });

  // The builder: one rule, Platform tier is TIER_1, into the new queue.
  const linksSection = ownerPage.getByRole("region", { name: "Flagged links" });
  await linksSection.getByRole("button", { name: "Add rule" }).click();
  await linksSection.getByLabel("Name", { exact: true }).fill("Big platforms first");
  await linksSection.getByLabel("Field").selectOption("platformTier");
  await linksSection.getByLabel("Operator").selectOption("eq");
  await linksSection.getByLabel("Platform tier value").selectOption("TIER_1");
  await linksSection.getByLabel("Destination queue").selectOption({ label: "Big platforms" });
  await linksSection.getByLabel("Priority", { exact: true }).fill("5");
  await linksSection.getByRole("button", { name: "Save rule" }).click();
  await expect(linksSection.getByText("Big platforms first")).toBeVisible({ timeout: 30_000 });
  // Rules are born drafts; the owner switches this one Live, which is its
  // second saved version.
  // Another journey may have left its own rule in this section, so the
  // controls are reached through this rule's own row.
  const bigRule = linksSection.getByRole("listitem").filter({ hasText: "Big platforms first" });
  await bigRule.getByLabel("Status").selectOption("LIVE");
  await expect(bigRule.getByText("v2")).toBeVisible({ timeout: 30_000 });

  // The Test panel: hand-entered values, a dry run. (The label is matched
  // without exact: a wrapping label's text for a select includes the
  // option texts, so the exact name never matches; the rule builder is
  // closed by the save, so the builder's "Platform tier value" control is
  // no longer on the page.)
  await linksSection.getByRole("button", { name: "Test these rules" }).click();
  await linksSection.getByLabel("Platform tier").selectOption("TIER_1");
  await linksSection.getByRole("button", { name: "Run test" }).click();
  await expect(linksSection.getByText("Would take this item")).toBeVisible({ timeout: 30_000 });
  await expect(linksSection.getByText("Chosen queue: Big platforms")).toBeVisible();

  // A second survivor files the same honest way; her links are flagged.
  const second = await seedFlaggedCase(page);

  // The console shows both queues with work in them.
  await ownerPage.goto("/admin/review");
  await expect(ownerPage.getByRole("list", { name: "Review queues" })).toContainText("Big platforms", { timeout: 30_000 });
  await ownerPage.getByRole("listitem").filter({ hasText: "Big platforms" }).getByRole("link", { name: "Preview" }).click();
  // (The preview page of a custom queue is this run's first hit of the
  // dynamic route, so its compile can outlast a default timeout.)
  await expect(ownerPage.getByRole("heading", { name: "Big platforms" })).toBeVisible({ timeout: 30_000 });

  // The job screen explains the routing in the spec's words.
  await ownerPage.goto("/admin/review/big-platforms");
  await expect(ownerPage).toHaveURL(/\/admin\/review\/big-platforms\/[^/]+$/, { timeout: 30_000 });
  await expect(ownerPage.getByText(/Routed here by rule Big platforms first \(version 2\)/)).toBeVisible();

  const jobId = ownerPage.url().split("/").pop()!;
  await withAdmin(async (db) => {
    // The fresh job: the second case's seeded-platform link, routed by the
    // rule at filing, in the custom queue, with the rule's priority.
    // (Scoped to that case: the query is exact, and the shared database
    // holds other specs' jobs too. The alias is quoted: Postgres folds an
    // unquoted alias to lowercase, and the row's queueKey would read
    // undefined.)
    const job = await db.query(
      `SELECT j.priority, j."routedByRuleVersion", q.key AS "queueKey", j."subjectKind"
         FROM "ReviewJob" j JOIN "ReviewQueue" q ON q.id = j."queueId"
        WHERE j."enqueueSource" = 'RULE' AND j."caseId" = $1`,
      [second.caseId],
    );
    expect(job.rows[0]).toMatchObject({ priority: 5, queueKey: "big-platforms", subjectKind: "FLAGGED_LINK" });

    // The routing log says why, and carries no address.
    const log = await db.query(
      `SELECT l.matched, l.details FROM "ReviewRoutingLog" l
         JOIN "ReviewRoutingRule" r ON r.id = l."ruleId"
        WHERE r.name = 'Big platforms first' AND l."jobId" = $1`,
      [jobId],
    );
    expect(log.rows[0].matched).toBe(true);
    expect(JSON.stringify(log.rows[0].details)).not.toContain("youtube.com");
    expect(JSON.stringify(log.rows[0].details)).not.toContain("http");

    // The rule decided nothing: her link still waits for a human.
    const url = await db.query(`SELECT status FROM "SubmittedUrl" WHERE domain = 'youtube.com' AND "caseId" = $1`, [
      second.caseId,
    ]);
    expect(url.rows[0].status).toBe("PENDING_REVIEW");
  });

  // The rule is shared state: every later spec files flagged links too, and
  // a live TIER_1 rule would route each of their seeded-platform links into
  // this custom queue. Switch it off through the page's own status control
  // so the suite leaves routing as it found it (the rule and its versions
  // stay, audited and inspectable, exactly as a disabled rule in production).
  await ownerPage.goto("/admin/review/rules");
  await bigRule.getByLabel("Status").selectOption("DISABLED");
  await expect(linksSection.getByText("Big platforms first")).toBeVisible();
  await expect(bigRule.getByLabel("Status")).toHaveValue("DISABLED");
  await owner.close();
});

test("the rules page is the owner's alone, and the pinned default queue is not editable", async ({ browser, page }) => {
  test.setTimeout(150_000);
  await seedFlaggedCase(page);

  const reviewer = await adminContext(browser, "e2e-reviewer", "CASE_REVIEWER");
  const reviewerPage = await reviewer.newPage();
  await reviewerPage.goto("/admin/review/rules");
  await expect(reviewerPage.getByRole("heading", { name: "Not available" })).toBeVisible();
  // The queue list never offers the link to a non-owner.
  await reviewerPage.goto("/admin/review");
  await expect(reviewerPage.getByRole("link", { name: "Routing rules" })).toHaveCount(0);
  await reviewer.close();

  const owner = await adminContext(browser, "e2e-admin");
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/admin/review/rules");
  // The default queue is pinned last, says so, and offers no controls.
  const linksSection = ownerPage.getByRole("region", { name: "Flagged links" });
  await expect(linksSection.getByText("No rule matched", { exact: false })).toBeVisible();
  await expect(linksSection.getByText("The default queue. It is pinned last, cannot be edited")).toBeVisible();
  await expect(linksSection.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await owner.close();
});
