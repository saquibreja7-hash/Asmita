import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { adminContext, testAdminEmail, testAdminHash } from "./support/admin";
import { withAdmin } from "./support/database";

// Review console WP144 (review-console-spec.md): queue access, the Admins
// page and step-up MFA. The owner narrows the Flagged links queue to one
// role and a CASE_REVIEWER loses it, the protected Possible minor queue
// ignores rows, the Admins page shows masked addresses only, and a stale
// authenticator proof refuses a routing-rule change with the step-up
// prompt. These specs run on dev-vm against the throwaway Postgres; every
// address below is a synthetic @example.invalid one, and the specs assert
// the full addresses never reach the page.

/** A session whose last authenticator proof is older than the 15-minute window. */
async function staleAdminContext(browser: Browser, sub = "e2e-admin") {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3001" });
  const token = await new SignJWT({
    role: "ADMIN", adminRole: "SUPER_ADMIN", ageOver18: true, emailHash: testAdminHash(sub),
    namespace: "admin", mfaComplete: true,
    mfaAt: Math.floor(Date.now() / 1000) - 20 * 60,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("asmita")
    .setAudience("asmita-web")
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("e2e-test-only-jwt-secret-32-chars-long"));
  await context.addCookies([
    { name: "asmita_admin_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}

async function post(request: APIRequestContext, path: string, data: unknown) {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  return request.post(path, { data, headers: { "x-csrf-token": token } });
}

test("queue access narrows who sees a queue, and the protected queue ignores rows", async ({ browser, page }) => {
  test.setTimeout(240_000);
  await page.goto("/"); // warm the server while the contexts sign in

  const owner = await adminContext(browser, "e2e-admin");
  const ownerPage = await owner.newPage();

  // The Admins page lists every allowlisted admin with masked addresses.
  await ownerPage.goto("/admin/admins");
  await expect(ownerPage.getByRole("heading", { name: "Admins" })).toBeVisible({ timeout: 30_000 });
  await expect(ownerPage.getByText("e*****@example.invalid").first()).toBeVisible();
  for (const sub of ["e2e-admin", "e2e-reviewer", "integrity-admin", "admin-1", "e2e-access-admin", "e2e-new-admin"]) {
    await expect(ownerPage.getByText(`${sub}@example.invalid`)).toHaveCount(0);
  }
  // The permission matrix comes from the permission map, read-only.
  await expect(ownerPage.getByRole("heading", { name: "Permissions" })).toBeVisible();
  await expect(ownerPage.getByText("review:manage")).toBeVisible();

  // Queue access: a role row narrows the Flagged links queue.
  const accessList = ownerPage.locator("#queue-access-list");
  const linksCard = accessList.locator("> div").filter({
    has: ownerPage.getByRole("heading", { name: "Flagged links", exact: true }),
  });
  await linksCard.getByLabel("Add access for Flagged links").selectOption({ label: "go editor" });
  await linksCard.getByRole("button", { name: "Add" }).click();
  await expect(linksCard.getByText("Role: go editor")).toBeVisible({ timeout: 30_000 });
  // The protected queue offers no access rows at all.
  await expect(accessList.getByRole("heading", { name: "Possible minor" })).toHaveCount(0);

  // The row in the database is ids and a role only.
  await withAdmin(async (db) => {
    const rows = await db.query(
      `SELECT a.role, q.key FROM "ReviewQueueAccess" a JOIN "ReviewQueue" q ON q.id = a."queueId"`,
    );
    expect(rows.rows).toEqual([{ role: "GO_EDITOR", key: "links" }]);
  });

  // A CASE_REVIEWER loses the narrowed queue everywhere.
  const reviewer = await adminContext(browser, "e2e-reviewer", "CASE_REVIEWER");
  const reviewerPage = await reviewer.newPage();
  await reviewerPage.goto("/admin/review");
  await expect(reviewerPage.getByRole("list", { name: "Review queues" })).toBeVisible({ timeout: 30_000 });
  await expect(reviewerPage.getByRole("list", { name: "Review queues" })).not.toContainText("Flagged links");
  await reviewerPage.goto("/admin/review/links");
  await expect(reviewerPage.getByRole("heading", { name: "Not available" })).toBeVisible();
  // The reviewer is a CASE_REVIEWER: the protected queue stays invisible.
  await reviewerPage.goto("/admin/review/minor-hold");
  await expect(reviewerPage.getByRole("heading", { name: "Not available" })).toBeVisible();

  // Removing the row returns the queue to today's behaviour.
  await linksCard.getByRole("button", { name: "Remove" }).click();
  await expect(linksCard.getByText("Role: go editor")).toHaveCount(0, { timeout: 30_000 });
  await reviewerPage.goto("/admin/review");
  await expect(reviewerPage.getByRole("list", { name: "Review queues" })).toContainText("Flagged links", { timeout: 30_000 });

  await reviewer.close();
  await owner.close();
});

test("a stale authenticator proof refuses the step-up actions and asks for a fresh code", async ({ browser, page }) => {
  test.setTimeout(180_000);
  await page.goto("/");

  const stale = await staleAdminContext(browser);
  const stalePage = await stale.newPage();

  // The routing rules builder asks for a fresh code on save.
  await stalePage.goto("/admin/review/rules");
  const linksSection = stalePage.getByRole("region", { name: "Flagged links" });
  await linksSection.getByRole("button", { name: "Add rule" }).click();
  await linksSection.getByLabel("Name", { exact: true }).fill("Step up proof rule");
  await linksSection.getByLabel("Field").selectOption("platformTier");
  await linksSection.getByLabel("Operator").selectOption("eq");
  await linksSection.getByLabel("Platform tier value").selectOption("TIER_1");
  await linksSection.getByRole("button", { name: "Save rule" }).click();
  await expect(stalePage.getByRole("dialog", { name: "Confirm it is you with a fresh authenticator code" })).toBeVisible({
    timeout: 30_000,
  });

  // A wrong code keeps the dialog open with the failure in words.
  await stalePage.getByLabel("Authenticator code").fill("000000");
  await stalePage.getByRole("button", { name: "Confirm" }).click();
  await expect(stalePage.getByText("That code was not accepted. Try the next one.")).toBeVisible({ timeout: 30_000 });
  await stalePage.getByRole("button", { name: "Cancel" }).click();
  await expect(stalePage.getByRole("dialog")).toHaveCount(0);
  await expect(linksSection.getByText("Nothing was changed: this needs a fresh authenticator code.")).toBeVisible();

  // The API refuses too, with the code the console listens for, and the
  // rule was never created.
  const refused = await post(stale.request, "/api/admin/review/rules", {
    name: "Should not exist",
    subjectKind: "FLAGGED_LINK",
    condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] },
    destinationQueueId: "review-queue-links",
  });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toEqual({ error: "mfa_step_up_required" });
  await withAdmin(async (db) => {
    const rules = await db.query(`SELECT count(*)::int AS n FROM "ReviewRoutingRule"`);
    expect(rules.rows[0].n).toBe(0);
  });

  // A fresh proof (the ordinary adminContext signs one at "sign-in") passes.
  const fresh = await adminContext(browser, "e2e-admin");
  const freshPage = await fresh.newPage();
  await freshPage.goto("/admin/review/rules");
  const freshSection = freshPage.getByRole("region", { name: "Flagged links" });
  await freshSection.getByRole("button", { name: "Add rule" }).click();
  await freshSection.getByLabel("Name", { exact: true }).fill("Fresh proof rule");
  await freshSection.getByLabel("Field").selectOption("platformTier");
  await freshSection.getByLabel("Operator").selectOption("eq");
  await freshSection.getByLabel("Platform tier value").selectOption("TIER_1");
  await freshSection.getByRole("button", { name: "Save rule" }).click();
  await expect(freshSection.getByText("Fresh proof rule")).toBeVisible({ timeout: 30_000 });
  await expect(freshPage.getByRole("dialog")).toHaveCount(0);

  // The Admins page is the owner's alone.
  const reviewer = await adminContext(browser, "e2e-reviewer", "CASE_REVIEWER");
  const reviewerPage = await reviewer.newPage();
  await reviewerPage.goto("/admin/admins");
  await expect(reviewerPage.getByRole("heading", { name: "Not available" })).toBeVisible();
  await reviewer.close();
  await fresh.close();
  await stale.close();
});

test("the admins page masks addresses and resolves a reset by hash", async ({ browser, page }) => {
  test.setTimeout(150_000);
  await page.goto("/");

  const owner = await adminContext(browser, "integrity-admin");
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/admin/admins");

  // The reset targets the admin's hash: the page never carries the address.
  const html = await ownerPage.content();
  expect(html).not.toContain(testAdminEmail("e2e-admin"));
  expect(html).not.toContain(testAdminEmail("e2e-reviewer"));
  const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
  expect(html).not.toContain(sha256(testAdminEmail("e2e-admin")));

  // A fresh proof lets the owner issue the one-time code for a listed admin.
  // The target is e2e-access-admin, which only this spec uses, so clearing
  // its enrolment cannot disturb another spec's signed-in admin.
  const issued = await post(owner.request, "/api/admin/mfa/reset", { emailHash: testAdminHash("e2e-access-admin") });
  expect(issued.ok(), await issued.text()).toBe(true);
  const { enrolmentCode } = (await issued.json()) as { enrolmentCode: string };
  expect(enrolmentCode).toMatch(/^\d{12}$/);

  // The audit trail records the reset; the enrolment row for the target is
  // cleared, ready for them to enrol with the code. The placeholder row is
  // then put back exactly as global-setup seeded it, so even a retried run
  // of this spec finds the admin enrolled again.
  await withAdmin(async (db) => {
    const mfa = await db.query(`SELECT count(*)::int AS n FROM "AdminMfaSecret" WHERE "emailHash" = $1`, [
      testAdminHash("e2e-access-admin"),
    ]);
    expect(mfa.rows[0].n).toBe(0);
    await db.query(
      `INSERT INTO "AdminMfaSecret" ("emailHash", "secretEncrypted", "enrolledAt", "confirmedAt")
       VALUES ($1, 'unused', now(), now())`,
      [testAdminHash("e2e-access-admin")],
    );
  });
  await owner.close();
});
