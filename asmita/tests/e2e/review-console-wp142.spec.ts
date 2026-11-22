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

// Review console WP142 (review-console-spec.md): the reason picker with the
// seeded reasons, the guidance drawer reading the per-queue draft, internal
// case notes on the job screen and the case page, and the SUPER_ADMIN
// reason settings. These specs run on dev-vm against the throwaway Postgres;
// every link and name below is invented. The console never shows an
// address, and the specs assert the submitted links never appear.

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
  await releaseReviewQueueLock();
});

test("the reason picker offers the seeded reasons, and Other demands its note", async ({ browser, page }) => {
  test.setTimeout(180_000);
  await seedFlaggedCase(page);
  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();

  await adminPage.goto("/admin/review");
  await adminPage.getByRole("listitem").filter({ hasText: "Flagged links" }).getByRole("link", { name: "Start reviewing" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/review\/links\/[^/]+$/, { timeout: 30_000 });
  const firstJobUrl = adminPage.url();

  // The guidance drawer reads the queue's draft, marked as one.
  await adminPage.getByRole("button", { name: "Guidance" }).click();
  const drawer = adminPage.getByRole("dialog", { name: "Guidance · Flagged links" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Draft: not reviewed");
  await expect(drawer).toContainText("Approve link moves the link to the notice queue. It sends nothing");
  await adminPage.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();

  // Reject with a seeded reason: the picker offers the seeded labels.
  await adminPage.getByRole("radio", { name: /Reject link/ }).check();
  const reasonSelect = adminPage.getByLabel("Reason (internal)");
  await expect(reasonSelect).toBeVisible();
  await reasonSelect.selectOption({ label: "Duplicate of another link" });
  await adminPage.getByRole("button", { name: "Submit" }).click();
  await expect(adminPage).not.toHaveURL(firstJobUrl, { timeout: 30_000 });
  await expect(adminPage.getByRole("heading", { name: /^Link on/ })).toBeVisible();
  const secondJobUrl = adminPage.url();

  // The decision carries the picked code, and the note field stayed empty:
  // the survivor's flag reason is untouched and no note was invented.
  await withAdmin(async (db) => {
    const decision = await db.query(
      `SELECT "reasonCode", "reasonNote", "caseId" FROM "ReviewDecision" WHERE "jobId" = $1`,
      [firstJobUrl.split("/").pop()!],
    );
    expect(decision.rows[0].reasonCode).toBe("duplicate_link");
    expect(decision.rows[0].reasonNote).toBeNull();
    // The survivor-visible flag reason of the link that was decided: the
    // console's internal reason never reaches it, and the existing review
    // clears it exactly as today's one-click reject does. (The link is
    // addressed by the decided job's subject, not by domain: any of the
    // case's links may be the oldest pending job.)
    const reason = await db.query(
      `SELECT u."flagReason" FROM "SubmittedUrl" u JOIN "ReviewJob" j ON j."subjectId" = u.id WHERE j.id = $1`,
      [firstJobUrl.split("/").pop()!],
    );
    expect(reason.rows[0].flagReason).toBeNull();
  });

  // On the next item, "Other (explain)" refuses to submit without its note.
  await adminPage.getByRole("radio", { name: /Reject link/ }).check();
  await adminPage.getByLabel("Reason (internal)").selectOption({ label: "Other (explain)" });
  const submit = adminPage.getByRole("button", { name: "Submit" });
  await expect(submit).toBeDisabled();
  await expect(adminPage.getByText("Explain this reason in the note")).toBeVisible();
  await adminPage.getByLabel("Note (internal)").fill("Same content as the link already decided.");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(adminPage).not.toHaveURL(secondJobUrl, { timeout: 30_000 });
  await withAdmin(async (db) => {
    const decision = await db.query(
      `SELECT "decision", "reasonCode", "reasonNote" FROM "ReviewDecision" WHERE "jobId" = $1`,
      [secondJobUrl.split("/").pop()!],
    );
    expect(decision.rows[0]).toMatchObject({ decision: "reject", reasonCode: "other" });
    // The note is stored encrypted, never in the clear.
    expect(String(decision.rows[0].reasonNote)).not.toContain("Same content");
    expect(String(decision.rows[0].reasonNote)).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });
  await admin.close();
});

test("internal notes: written from the job screen, read on the case page, deleted by their author", async ({ browser, page }) => {
  test.setTimeout(180_000);
  // The note must land on THIS case, so the queue must hold only this
  // case's links when the job is claimed (the shared database may hold
  // other specs' flagged links, and the console hands out the oldest
  // first). Resolve the leftovers, seed, then resolve anything that
  // arrived meanwhile — never this case's own links.
  await resolveLeftoverFlaggedLinks();
  const seeded = await seedFlaggedCase(page);
  await resolveLeftoverFlaggedLinks({ exceptCaseId: seeded.caseId });
  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();

  await adminPage.goto("/admin/review");
  await adminPage.getByRole("listitem").filter({ hasText: "Flagged links" }).getByRole("link", { name: "Start reviewing" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/review\/links\/[^/]+$/, { timeout: 30_000 });
  const jobId = adminPage.url().split("/").pop()!;

  // Enter posts; Shift+Enter adds a line. Both lines survive.
  const noteField = adminPage.getByLabel("Add a note");
  await noteField.fill("Spoke to the helpline desk.");
  await noteField.press("Shift+Enter");
  await noteField.pressSequentially("She will call back in the evening.");
  await noteField.press("Enter");
  await expect(adminPage.getByRole("list", { name: "Internal case notes" })).toContainText(
    "Spoke to the helpline desk.",
    { timeout: 30_000 },
  );
  await expect(adminPage.getByRole("list", { name: "Internal case notes" })).toContainText("She will call back in the evening.");

  // The note is stored encrypted and linked to the job it was written from.
  await withAdmin(async (db) => {
    const rows = await db.query(
      `SELECT "id", "jobId", "bodyEncrypted", "deletedAt" FROM "CaseNote" WHERE "caseId" = $1`,
      [seeded.caseId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].jobId).toBe(jobId);
    expect(rows.rows[0].deletedAt).toBeNull();
    expect(String(rows.rows[0].bodyEncrypted)).not.toContain("helpline desk");
    expect(String(rows.rows[0].bodyEncrypted)).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    const events = await db.query(
      `SELECT "eventType", "data" FROM "audit_log" WHERE "eventType" IN ('CASE_NOTE_ADDED', 'CASE_NOTE_DELETED') AND "entityId" = $1`,
      [rows.rows[0].id],
    );
    expect(events.rows.map((row: { eventType: string }) => row.eventType)).toEqual(["CASE_NOTE_ADDED"]);
    expect(JSON.stringify(events.rows)).not.toContain("helpline desk");
  });

  // The same note on the case page, then gone after the delete.
  await adminPage.goto(`/admin/cases/${seeded.referenceNumber}`);
  await expect(adminPage.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(adminPage.getByRole("list", { name: "Internal case notes" })).toContainText("She will call back in the evening.");
  await adminPage.getByRole("button", { name: "Delete" }).click();
  // The note's text leaves the page. (Asserted on the text, not the list:
  // the list itself disappears once the case's last note is gone.)
  await expect(adminPage.getByText("She will call back in the evening.")).toHaveCount(0, { timeout: 30_000 });
  await withAdmin(async (db) => {
    const rows = await db.query(`SELECT "deletedAt" FROM "CaseNote" WHERE "caseId" = $1`, [seeded.caseId]);
    expect(rows.rows[0].deletedAt).not.toBeNull();
    const events = await db.query(
      `SELECT "eventType" FROM "audit_log" WHERE "eventType" IN ('CASE_NOTE_ADDED', 'CASE_NOTE_DELETED') ORDER BY "sequence" ASC`,
    );
    expect(events.rows.map((row: { eventType: string }) => row.eventType)).toEqual(["CASE_NOTE_ADDED", "CASE_NOTE_DELETED"]);
  });
  await admin.close();
});

test("review settings: a SUPER_ADMIN shapes the reasons, everyone else is refused", async ({ browser, page }) => {
  test.setTimeout(150_000);
  await seedFlaggedCase(page);

  const reviewer = await adminContext(browser, "e2e-reviewer", "CASE_REVIEWER");
  const reviewerPage = await reviewer.newPage();
  await reviewerPage.goto("/admin/review/settings");
  await expect(reviewerPage.getByRole("heading", { name: "Not available" })).toBeVisible();
  await reviewerPage.goto("/admin/review");
  // The queue list never offers the link to a non-owner.
  await expect(reviewerPage.getByRole("link", { name: "Review settings" })).toHaveCount(0);

  const owner = await adminContext(browser, "e2e-admin");
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/admin/review/settings");
  const linksCard = ownerPage.locator("div.a-card", { hasText: "Flagged links" }).first();
  await expect(linksCard).toContainText("Not a link to the reported content");
  await expect(linksCard).toContainText("Other (explain)");
  // The protected queue offers no decisions and says so. (Matched by its
  // heading, not its text: the Crawler findings card also names its
  // "Label possible minor" decision.)
  const minorHoldCard = ownerPage
    .locator("div.a-card")
    .filter({ has: ownerPage.getByRole("heading", { name: "Possible minor", exact: true }) });
  await expect(minorHoldCard).toContainText("offers no decisions");

  // Add a reason to the links queue's reject decision (the second decision
  // group of the card: the adapter's order is approve, then reject).
  await linksCard.getByRole("button", { name: "Add a reason" }).nth(1).click();
  await ownerPage.getByLabel("Code for a new Reject link reason").fill("e2e_added_reason");
  await ownerPage.getByLabel("Label for a new Reject link reason").fill("E2E added reason");
  await ownerPage.getByRole("button", { name: "Add reason" }).click();
  const addedRow = ownerPage.locator("li", { hasText: "E2E added reason" }).first();
  await expect(addedRow).toBeVisible({ timeout: 30_000 });

  // Rename it, then deactivate it: reasons are never deleted.
  await addedRow.getByRole("button", { name: "Rename" }).click();
  await addedRow.getByRole("textbox").fill("E2E renamed reason");
  await addedRow.getByRole("button", { name: "Save" }).click();
  const renamedRow = ownerPage.locator("li", { hasText: "E2E renamed reason" }).first();
  await expect(renamedRow).toBeVisible({ timeout: 30_000 });
  await renamedRow.getByRole("button", { name: "Deactivate" }).click();
  await expect(renamedRow).toContainText("Inactive", { timeout: 30_000 });

  // The inactive reason is hidden from the picker, the seeded ones are not.
  await ownerPage.goto("/admin/review");
  await ownerPage.getByRole("listitem").filter({ hasText: "Flagged links" }).getByRole("link", { name: "Start reviewing" }).click();
  await expect(ownerPage).toHaveURL(/\/admin\/review\/links\/[^/]+$/, { timeout: 30_000 });
  await ownerPage.getByRole("radio", { name: /Reject link/ }).check();
  const options = ownerPage.getByLabel("Reason (internal)");
  await expect(options).toContainText("Duplicate of another link");
  await expect(options).not.toContainText("E2E renamed reason");

  await withAdmin(async (db) => {
    const reason = await db.query(`SELECT "label", "active" FROM "ReviewReason" WHERE "code" = 'e2e_added_reason'`);
    expect(reason.rows[0]).toMatchObject({ label: "E2E renamed reason", active: false });
  });
  await reviewer.close();
  await owner.close();
});
