import { expect, test } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";
import { seedFlaggedCase } from "./support/review";

// Review console WP143 (review-console-spec.md): routing rules. The owner
// builds a custom queue and a rule in the structured builder, tests it with
// hand-entered values, and a freshly filed flagged link is routed into the
// custom queue with the rule's priority — while nothing is decided, sent or
// labelled anywhere. The reviewer role never sees the rules page. These
// specs run on dev-vm against the throwaway Postgres; every link and name
// below is invented, and the specs assert the submitted links never appear
// in any routing row.

test("a live rule routes a freshly filed link into a custom queue, and the console explains why", async ({ browser, page }) => {
  test.setTimeout(240_000);
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
  await linksSection.getByLabel("Status").selectOption("LIVE");
  await expect(linksSection.getByText("v2")).toBeVisible({ timeout: 30_000 });

  // The Test panel: hand-entered values, a dry run.
  await linksSection.getByRole("button", { name: "Test these rules" }).click();
  await linksSection.getByLabel("Platform tier", { exact: true }).selectOption("TIER_1");
  await linksSection.getByRole("button", { name: "Run test" }).click();
  await expect(linksSection.getByText("Would take this item")).toBeVisible({ timeout: 30_000 });
  await expect(linksSection.getByText("Chosen queue: Big platforms")).toBeVisible();

  // A second survivor files the same honest way; her links are flagged.
  const second = await seedFlaggedCase(page);

  // The console shows both queues with work in them.
  await ownerPage.goto("/admin/review");
  await expect(ownerPage.getByRole("list", { name: "Review queues" })).toContainText("Big platforms", { timeout: 30_000 });
  await ownerPage.getByRole("listitem").filter({ hasText: "Big platforms" }).getByRole("link", { name: "Preview" }).click();
  await expect(ownerPage.getByRole("heading", { name: "Big platforms" })).toBeVisible();

  // The job screen explains the routing in the spec's words.
  await ownerPage.goto("/admin/review/big-platforms");
  await expect(ownerPage).toHaveURL(/\/admin\/review\/big-platforms\/[^/]+$/, { timeout: 30_000 });
  await expect(ownerPage.getByText(/Routed here by rule Big platforms first \(version 2\)/)).toBeVisible();

  const jobId = ownerPage.url().split("/").pop()!;
  await withAdmin(async (db) => {
    // The fresh job: routed by the rule, in the custom queue, with the rule's
    // priority, and created by routing.
    const job = await db.query(
      `SELECT j.priority, j."routedByRuleVersion", q.key AS queueKey, j."subjectKind"
         FROM "ReviewJob" j JOIN "ReviewQueue" q ON q.id = j."queueId"
        WHERE j."enqueueSource" = 'RULE'`,
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
