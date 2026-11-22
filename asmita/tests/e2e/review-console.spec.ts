import { expect, test } from "@playwright/test";
import { adminContext, testAdminHash } from "./support/admin";
import { withAdmin } from "./support/database";
import { FLAG_COUNT, seedFlaggedCase } from "./support/review";

// Review console WP141 (review-console-spec.md). These specs run on dev-vm
// against the throwaway Postgres: the review loop end to end through the
// survivor's own filing (every link below is invented), a lost claim that can
// never submit, and the protected minor-hold queue invisible to a
// CASE_REVIEWER. The console never shows an address: the specs assert the
// full submitted links never appear on any screen.

test("the review loop: start reviewing, approve with a reason, skip on, catch up", async ({ browser, page }) => {
  test.setTimeout(180_000);
  // Seed through the survivor's own flow, then work the queue as a SUPER_ADMIN.
  const seeded = await seedFlaggedCase(page);
  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();

  await adminPage.goto("/admin/review");
  const linksRow = adminPage.getByRole("listitem").filter({ hasText: "Flagged links" });
  await expect(linksRow).toContainText(`${FLAG_COUNT}`);
  // A queue with nothing in it says so, and its button is disabled.
  const partnerRow = adminPage.getByRole("listitem").filter({ hasText: "Partner applications" });
  await expect(partnerRow).toContainText("Nothing to review");
  await expect(partnerRow.getByRole("button", { name: "Start reviewing" })).toBeDisabled();

  // The preview lists the queue without claiming anything.
  await linksRow.getByRole("link", { name: "Preview" }).click();
  await expect(adminPage.getByRole("heading", { name: "Flagged links · preview" })).toBeVisible();
  await expect(adminPage.getByRole("table")).toContainText("Link on youtube.com · YouTube");
  for (const link of seeded.links) {
    await expect(adminPage.locator("main")).not.toContainText(link);
  }
  await adminPage.getByRole("link", { name: "Queues" }).click();
  await expect(adminPage.getByRole("heading", { name: "Review" })).toBeVisible();

  // Start reviewing: the first job is the seeded-platform link, oldest first.
  await adminPage.getByRole("listitem").filter({ hasText: "Flagged links" }).getByRole("link", { name: "Start reviewing" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/review\/links\/[^/]+$/, { timeout: 30_000 });
  const firstJobUrl = adminPage.url();
  await expect(adminPage.getByRole("heading", { name: "Link on youtube.com · YouTube" })).toBeVisible();
  await expect(adminPage.getByText(`Case ${seeded.referenceNumber}`)).toBeVisible();
  await expect(adminPage.getByText(`${FLAG_COUNT} left in this queue`)).toBeVisible();
  await expect(adminPage.locator("main")).not.toContainText("watch?v=");

  // Refreshing keeps the claim: the same job, still decidable.
  await adminPage.reload();
  await expect(adminPage.getByRole("heading", { name: "Link on youtube.com · YouTube" })).toBeVisible();
  await expect(adminPage.getByRole("radio", { name: /Approve link/ })).toBeVisible();

  // Approve with a reason, from the keyboard: 1 chooses, the note records,
  // Ctrl+Enter submits, and the next job loads by itself.
  await adminPage.getByRole("radio", { name: /Approve link/ }).check();
  await adminPage.getByLabel("Note (internal)").fill("Checked against the case notes before approving.");
  await adminPage.keyboard.press("Control+Enter");
  await expect(adminPage).not.toHaveURL(firstJobUrl, { timeout: 30_000 });
  await expect(adminPage.getByRole("heading", { name: /^Link on/ })).toBeVisible();
  await expect(adminPage.getByText(`${FLAG_COUNT - 1} left in this queue`)).toBeVisible();

  // Skip the rest, one keypress each, until the queue is caught up. Every
  // successful skip navigates (to the next job or the caught-up page), so
  // waiting for the URL to change keeps the keypresses in step.
  const caughtUp = adminPage.getByRole("heading", { name: "You're all caught up" });
  for (let i = 0; i < FLAG_COUNT; i += 1) {
    if (await caughtUp.isVisible().catch(() => false)) break;
    const urlBefore = adminPage.url();
    await adminPage.keyboard.press("s");
    await adminPage.waitForURL((url) => url.toString() !== urlBefore, { timeout: 30_000 }).catch(() => undefined);
  }
  await expect(caughtUp).toBeVisible({ timeout: 30_000 });
  await expect(adminPage.getByRole("link", { name: "Back to the queues" })).toBeVisible();

  // The decisions are recorded: one approval by this admin, the rest skipped.
  const adminHash = testAdminHash("e2e-admin");
  await withAdmin(async (db) => {
    const decisions = await db.query(
      `SELECT count(*)::int AS n FROM "ReviewDecision" WHERE "reviewerEmailHash" = $1 AND decision = 'approve'`,
      [adminHash],
    );
    expect(decisions.rows[0].n).toBe(1);
    const skips = await db.query(`SELECT count(*)::int AS n FROM "ReviewSkip" WHERE "reviewerEmailHash" = $1`, [adminHash]);
    expect(skips.rows[0].n).toBe(FLAG_COUNT - 1);
    // The approved link moved on exactly as the one-click buttons move it.
    const approved = await db.query(
      `SELECT status FROM "SubmittedUrl" WHERE "caseId" = $1 AND domain = 'youtube.com'`,
      [seeded.caseId],
    );
    expect(approved.rows[0].status).toBe("NOTICE_QUEUED");
    // The internal reason never reached the survivor-visible flag reason.
    const reason = await db.query(
      `SELECT "flagReason" FROM "SubmittedUrl" WHERE "caseId" = $1 AND domain = 'youtube.com'`,
      [seeded.caseId],
    );
    expect(reason.rows[0].flagReason).not.toContain("Checked against the case notes");
  });
  await admin.close();
});

test("a lost claim never submits: the panel says who has it and moves on", async ({ browser, page }) => {
  test.setTimeout(180_000);
  await seedFlaggedCase(page);
  const admin = await adminContext(browser, "admin-1");
  const adminPage = await admin.newPage();

  await adminPage.goto("/admin/review");
  await adminPage.getByRole("listitem").filter({ hasText: "Flagged links" }).getByRole("link", { name: "Start reviewing" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/review\/links\/[^/]+$/, { timeout: 30_000 });
  const jobId = adminPage.url().split("/").pop()!;

  // A colleague takes the lease (the way an expired lease looks to the server
  // once somebody else claimed the job).
  const otherHash = testAdminHash("integrity-admin");
  await withAdmin((db) =>
    db.query(
      `UPDATE "ReviewJob" SET "claimedBy" = $1, "claimedUntil" = now() + interval '10 minutes' WHERE "id" = $2`,
      [otherHash, jobId],
    ),
  );

  // The holder's page refuses to submit and says why, in the spec's words.
  await adminPage.getByRole("radio", { name: /Approve link|Reject link/ }).first().check();
  await adminPage.getByRole("button", { name: "Submit" }).click();
  await expect(adminPage.getByText("Someone else has this now")).toBeVisible({ timeout: 30_000 });
  await expect(adminPage.getByRole("link", { name: "Get the next one" })).toBeVisible();

  // Nothing was decided on the stolen job.
  await withAdmin(async (db) => {
    const decided = await db.query(`SELECT count(*)::int AS n FROM "ReviewDecision" WHERE "jobId" = $1`, [jobId]);
    expect(decided.rows[0].n).toBe(0);
  });

  // A reload of the same job shows the lost claim server-side too.
  await adminPage.goto(adminPage.url());
  await expect(adminPage.getByText("Someone else has this now")).toBeVisible();

  // The way back into the queue works.
  const urlBefore = adminPage.url();
  await adminPage.getByRole("link", { name: "Get the next one" }).click();
  await adminPage.waitForURL((url) => url.toString() !== urlBefore, { timeout: 30_000 });
  await admin.close();
});

test("minor-hold is invisible to a CASE_REVIEWER, visible only to a SUPER_ADMIN", async ({ browser }) => {
  test.setTimeout(120_000);
  const reviewer = await adminContext(browser, "e2e-reviewer", "CASE_REVIEWER");
  const reviewerPage = await reviewer.newPage();
  await reviewerPage.goto("/admin/review");
  await expect(reviewerPage.getByRole("heading", { name: "Review" })).toBeVisible();
  // The reviewer sees the complaint queues...
  await expect(reviewerPage.getByRole("listitem").filter({ hasText: "Flagged links" })).toBeVisible();
  await expect(reviewerPage.getByRole("listitem").filter({ hasText: "Fingerprints" })).toBeVisible();
  // ...and never the protected queue, not even as a row.
  await expect(reviewerPage.getByText("Possible minor")).toHaveCount(0);
  // Direct entry is refused with the page's own words.
  await reviewerPage.goto("/admin/review/minor-hold");
  await expect(reviewerPage.getByRole("heading", { name: "Not available" })).toBeVisible();
  await expect(reviewerPage.getByText("Your admin role cannot review this queue.")).toBeVisible();

  const owner = await adminContext(browser, "e2e-admin");
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/admin/review");
  await expect(ownerPage.getByRole("listitem").filter({ hasText: "Possible minor" })).toBeVisible();
  await reviewer.close();
  await owner.close();
});
