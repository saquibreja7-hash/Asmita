import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminContext, testAdminHash } from "./support/admin";
import { withAdmin } from "./support/database";
import {
  acquireReviewQueueLock,
  FLAG_COUNT,
  releaseReviewQueueLock,
  resolveLeftoverFlaggedLinks,
  seedFlaggedCase,
  warmConsoleRoutes,
} from "./support/review";

// Review console WP145 (review-console-spec.md): decisions log, review
// metrics and safer bulk actions. These specs run on dev-vm against the
// throwaway Postgres. The bulk routes now confirm the exact count and the
// decision, demand the typed count above ten items, close each item's
// console job with a ReviewDecision, and write one ADMIN_BULK_ACTION summary
// event beside the existing per-item events. The decisions log and its CSV
// carry ids, labels and handles only — the specs assert the submitted links
// never appear there. Every link and every fingerprint below is invented.

// Spec files run in parallel and the review console is one shared queue
// system: this file-level lock serialises the review-console specs against
// each other while the rest of the suite keeps running in parallel, and the
// warm-up compiles the routes before any test's clock runs.
test.beforeAll(async ({ browser }) => {
  await acquireReviewQueueLock();
  await warmConsoleRoutes(browser);
});
test.afterAll(async () => {
  await releaseReviewQueueLock();
});

async function registerForFingerprint(page: import("@playwright/test").Page) {
  await page.goto("/register");
  await page.getByRole("radio", { name: "I am 18 years of age or older." }).check();
  await page.getByRole("radio", { name: "I was 18 or older." }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`wp145-${Date.now()}-${randomUUID().slice(0, 6)}@filing.example.com`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

async function syntheticPng(page: import("@playwright/test").Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = (x + y) % 32 ? "#55aacc" : "#ee7733";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

test("bulk links confirm the exact count, demand the typed count above ten, and decide every item", async ({ browser, page }) => {
  test.setTimeout(240_000);
  // Two survivor cases through the real filing flow: twelve flagged links.
  const first = await seedFlaggedCase(page);
  const second = await seedFlaggedCase(page);
  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();

  await adminPage.goto("/admin/queue");
  // Select only this spec's own rows (the throwaway database is shared
  // with the other specs, so the queue may hold their links too).
  for (const reference of [first.referenceNumber, second.referenceNumber]) {
    const boxes = adminPage.getByRole("checkbox", { name: new RegExp(reference) });
    await expect(boxes).toHaveCount(FLAG_COUNT);
    for (const box of await boxes.all()) await box.check();
  }
  await expect(adminPage.getByText(`${2 * FLAG_COUNT} selected`)).toBeVisible();

  // The confirm step states the exact count and the decision; above ten
  // items the count must also be typed, and a reject also needs its
  // survivor-visible reason before the confirm button enables.
  await adminPage.getByRole("button", { name: `Reject ${2 * FLAG_COUNT}…` }).click();
  await expect(adminPage.getByText(`You are about to reject ${2 * FLAG_COUNT} links.`)).toBeVisible();
  const typed = adminPage.getByLabel(`Type ${2 * FLAG_COUNT} to confirm`);
  await typed.fill("11");
  await adminPage.getByLabel("Reason for rejecting, shown in the survivor's case").fill("Not the survivor's content");
  await expect(adminPage.getByRole("button", { name: `Confirm: reject ${2 * FLAG_COUNT} links` })).toBeDisabled();
  await typed.fill(String(2 * FLAG_COUNT));
  await expect(adminPage.getByRole("button", { name: `Confirm: reject ${2 * FLAG_COUNT} links` })).toBeEnabled();
  await adminPage.getByRole("button", { name: `Confirm: reject ${2 * FLAG_COUNT} links` }).click();

  await expect(adminPage.getByText(`${2 * FLAG_COUNT} done`)).toBeVisible({ timeout: 30_000 });

  // Every item went through the existing review, the console recorded one
  // decision per item, and the whole run wrote one summary event.
  const adminHash = testAdminHash("e2e-admin");
  await withAdmin(async (db) => {
    for (const seeded of [first, second]) {
      const rejected = await db.query(
        `SELECT count(*)::int AS n FROM "SubmittedUrl" WHERE "caseId" = $1 AND status = 'REJECTED'`,
        [seeded.caseId],
      );
      expect(rejected.rows[0].n).toBe(FLAG_COUNT);
      const decisions = await db.query(
        `SELECT count(*)::int AS n FROM "ReviewDecision" WHERE "caseId" = $1 AND decision = 'reject' AND "reviewerEmailHash" = $2`,
        [seeded.caseId, adminHash],
      );
      expect(decisions.rows[0].n).toBe(FLAG_COUNT);
    }
    const summary = await db.query(
      `SELECT count(*)::int AS n FROM "audit_log" WHERE "eventType" = 'ADMIN_BULK_ACTION' AND data->>'requested' = $1`,
      [String(2 * FLAG_COUNT)],
    );
    expect(summary.rows[0].n).toBe(1);
    const jobsLeft = await db.query(
      `SELECT count(*)::int AS n FROM "ReviewJob" j
        JOIN "SubmittedUrl" u ON u.id = j."subjectId"
        WHERE j."caseId" IN ($1, $2) AND j.status = 'PENDING'`,
      [first.caseId, second.caseId],
    );
    expect(jobsLeft.rows[0].n).toBe(0);
  });
  await admin.close();
});

test("bulk fingerprints approve through the same confirm step", async ({ browser, page }) => {
  test.setTimeout(240_000);
  await registerForFingerprint(page);
  await page.getByLabel("Links where the content appears").fill(`https://youtube.com/watch?v=wp145-${randomUUID()}`);
  await expect(page.locator("#url-checks")).toBeVisible();
  const workerScript = page.waitForResponse(
    (r) => /(hash[._-]?worker|turbopack-worker)/i.test(r.url()) && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic.png", mimeType: "image/png",
    buffer: await syntheticPng(page),
  });
  expect((await workerScript).ok()).toBe(true);
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByText(/I declare that I am the person depicted/).click();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  // The fingerprint is posted by the page as its own second request, after
  // the case exists; the row only reaches the queue when that lands, so the
  // spec waits for it instead of racing the page's background work.
  const hashResponse = page.waitForResponse((r) => /\/api\/cases\/[^/]+\/hashes$/.test(r.url()), { timeout: 60_000 });
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = (await (await createResponse).json()) as { caseId: string; referenceNumber: string };
  expect((await hashResponse).ok()).toBe(true);

  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();
  await adminPage.goto("/admin/hashes");
  const box = adminPage.getByRole("checkbox", { name: new RegExp(created.referenceNumber) });
  // The first test to open this page in a run pays the dev server's
  // compile; give the row time to appear.
  await expect(box).toHaveCount(1, { timeout: 30_000 });
  await box.check();
  await adminPage.getByRole("button", { name: "Approve 1…" }).click();
  await expect(adminPage.getByText("You are about to approve 1 fingerprint.")).toBeVisible();
  await adminPage.getByRole("button", { name: "Confirm: approve 1 fingerprint" }).click();
  await expect(adminPage.getByText("1 done")).toBeVisible({ timeout: 30_000 });

  await withAdmin(async (db) => {
    const hash = await db.query(`SELECT status FROM "HashSubmission" WHERE "caseId" = $1`, [created.caseId]);
    expect(hash.rows[0].status).toBe("APPROVED");
    const decision = await db.query(
      `SELECT decision FROM "ReviewDecision" WHERE "caseId" = $1 AND "subjectKind" = 'FINGERPRINT'`,
      [created.caseId],
    );
    expect(decision.rows[0].decision).toBe("approve");
  });
  await admin.close();
});

test("the decisions log lists what was decided, and its CSV carries no address", async ({ browser, page }) => {
  test.setTimeout(240_000);
  // The reject below must land on THIS case's seeded-platform link, so the
  // queue must hold only this case's links when it is claimed (the shared
  // database may hold other specs' flagged links, and the console hands out
  // the oldest first). Resolve the leftovers, seed, then resolve anything
  // that arrived meanwhile — never this case's own links.
  await resolveLeftoverFlaggedLinks();
  const seeded = await seedFlaggedCase(page);
  await resolveLeftoverFlaggedLinks({ exceptCaseId: seeded.caseId });
  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();

  // Decide the case's seeded-platform link through the console's own loop.
  await adminPage.goto("/admin/review");
  await adminPage.getByRole("listitem").filter({ hasText: "Flagged links" }).getByRole("link", { name: "Start reviewing" }).click();
  await expect(adminPage).toHaveURL(/\/admin\/review\/links\/[^/]+$/, { timeout: 30_000 });
  const jobUrl = adminPage.url();
  await adminPage.getByRole("radio", { name: /Reject link/ }).check();
  await adminPage.getByLabel("Reason (internal)").selectOption("duplicate_link");
  await adminPage.keyboard.press("Control+Enter");
  await expect(adminPage).not.toHaveURL(jobUrl, { timeout: 30_000 });

  await adminPage.goto(`/admin/review/decisions?case=${seeded.referenceNumber}`);
  await expect(adminPage.getByRole("heading", { name: "Decisions log" })).toBeVisible();
  const row = adminPage.getByRole("row").filter({ hasText: "Rejected" });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toContainText("Duplicate of another link");
  await expect(row).toContainText("You");
  await expect(row).toContainText("Default queue");
  await expect(adminPage.locator("main")).not.toContainText("example.test");
  await expect(adminPage.locator("main")).not.toContainText("youtube.com/watch");

  // The CSV export of the same filtered set: fixed columns, no URL, no note.
  const response = await adminPage.request.get(`/api/admin/review/decisions/export?case=${seeded.referenceNumber}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();
  const lines = csv.trimEnd().split("\r\n");
  expect(lines[0]).toBe(
    '"Decided at (IST)","Queue","Kind","Decision","Reason","Reviewer","Case reference","Claim-to-decision seconds"',
  );
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain('"Rejected"');
  expect(lines[1]).toContain('"Duplicate of another link"');
  expect(csv).not.toContain("example.test");
  expect(csv).not.toContain("youtube.com");
  expect(csv).not.toContain("Checked against");

  // The export is audited.
  await withAdmin(async (db) => {
    const exported = await db.query(
      `SELECT count(*)::int AS n FROM "audit_log" WHERE "eventType" = 'ADMIN_ACTION' AND data->>'action' = 'decisions_csv_export'`,
    );
    expect(exported.rows[0].n).toBeGreaterThan(0);
  });
  await admin.close();
});

test("the metrics page labels every figure and says when there is not enough data", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await adminContext(browser, "e2e-admin");
  const adminPage = await admin.newPage();
  await adminPage.goto("/admin/review/metrics");
  await expect(adminPage.getByRole("heading", { name: "Review metrics" })).toBeVisible();
  // The figure's own label exactly (a table heading and caption on the same
  // page repeat the words "Open now").
  await expect(adminPage.getByText("Open now", { exact: true })).toBeVisible();
  // Each section is matched by its heading: every table's sr-only caption
  // repeats the heading's words.
  await expect(adminPage.getByRole("heading", { name: /Decisions by queue/ })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: /Decisions by reviewer/ })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: /Skips by queue/ })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: /Jobs created, by day/ })).toBeVisible();
  // The window and bucket controls keep their state in the URL.
  await adminPage.getByRole("link", { name: "Last 90 days" }).click();
  await expect(adminPage).toHaveURL(/days=90/);
  await adminPage.getByRole("link", { name: "By week" }).click();
  await expect(adminPage).toHaveURL(/days=90&bucket=week/);
  await expect(adminPage.getByRole("heading", { name: /Jobs created, by week/ })).toBeVisible();
  await admin.close();
});
