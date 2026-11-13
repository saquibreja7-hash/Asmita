import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";

// ADR 004, M8 + M9: what the survivor signs is exactly what is sent. Each
// signed document records its own fingerprints; dispatch sends only those,
// and only once every one of them is approved.

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`integrity-${randomUUID()}@example.invalid`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

async function syntheticPng(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = (x * 7 + y * 3) % 48 ? "#3366aa" : "#cc5522";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

// Survivor reports WhatsApp links (a verified email platform) with one
// fingerprint made on their device. Returns the new case id.
async function reportWithFingerprint(page: Page, links: string[]) {
  await register(page);
  await page.getByLabel("Links where the content appears").fill(links.join("\n"));
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: await syntheticPng(page),
  });
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  const hashResponse = page.waitForResponse(
    (r) => /\/api\/cases\/[^/]+\/hashes$/.test(r.url()) && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = (await created.json()) as { caseId: string };
  // The fingerprint is saved by a second request; let it finish before leaving.
  expect((await hashResponse).ok()).toBe(true);
  // Whether the sign form shows here depends on legal review state, which
  // other journeys change; sign from the case instead.
  await page.goto(`/case/${caseId}`);
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();
  return caseId;
}

async function post(request: APIRequestContext, path: string, data: unknown) {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  return request.post(path, { data, headers: { "x-csrf-token": token } });
}

// A later fingerprint, added by the survivor after signing: refused, because
// fingerprints are only added while the case is being created.
async function expectFingerprintRefused(page: Page, caseId: string) {
  const response = await post(page.request, `/api/cases/${caseId}/hashes`, {
    hashes: [{ hash: randomBytes(32).toString("hex"), quality: 90 }],
    declaration: true,
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: "fingerprints_closed" });
}

async function adminRequest(browser: Browser) {
  return (await adminContext(browser, "integrity-admin")).request;
}

const fingerprintIds = (caseId: string) =>
  withAdmin(async (db) =>
    (await db.query('SELECT id FROM "HashSubmission" WHERE "caseId" = $1 ORDER BY "submittedAt"', [caseId])).rows.map(
      (r) => r.id as string,
    ),
  );

// In this throwaway database the test plays the human legal reviewer.
const markTemplateReviewed = (templateType: string) =>
  withAdmin((db) =>
    db.query(`UPDATE "NoticeTemplate" SET "reviewedByLegal" = true WHERE "templateType" = $1 AND "isActive"`, [
      templateType,
    ]),
  );

async function signNextNotice(page: Page, caseId: string) {
  await page.goto(`/case/${caseId}/sign`);
  await page.getByLabel("Full name", { exact: true }).fill("Synthetic Survivor");
  await page.getByLabel("Email address").fill("survivor@example.invalid");
  await page.getByPlaceholder("Type your full name").fill("Synthetic Survivor");
  await page.getByRole("checkbox", { name: /I confirm that the information above is accurate/ }).check();
  const signed = page.waitForResponse((r) => r.url().endsWith("/sign-notice"));
  await page.getByRole("button", { name: "Sign and submit" }).click();
  expect((await signed).ok()).toBe(true);
}

test.describe("notice integrity", () => {
  test("each signed URL notice sends exactly the fingerprints it lists, and no fingerprint can be added after signing", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(180_000);
    const caseId = await reportWithFingerprint(page, [
      `https://www.whatsapp.com/channel/asmita-synthetic-${randomUUID()}`,
      `https://wa.me/asmita-synthetic-${randomUUID()}`,
    ]);
    const [fingerprintA] = await fingerprintIds(caseId);

    // Verified email platforms queue the notice at creation; signing waits on
    // the human legal review of the template.
    await markTemplateReviewed("IT_RULES_2021");
    const admin = await adminRequest(browser);
    const urlIds = await withAdmin(async (db) =>
      (await db.query('SELECT id FROM "SubmittedUrl" WHERE "caseId" = $1', [caseId])).rows.map((r) => r.id as string),
    );
    expect(urlIds).toHaveLength(2);

    // Sign the first notice; a fingerprint can no longer be added.
    await signNextNotice(page, caseId);
    await expectFingerprintRefused(page, caseId);
    await signNextNotice(page, caseId);
    expect(await fingerprintIds(caseId)).toEqual([fingerprintA]);

    const signedSets = await withAdmin(async (db) =>
      (await db.query('SELECT id, "signedHashSubmissionIds" AS ids FROM "SubmittedUrl" WHERE "caseId" = $1', [caseId]))
        .rows as { id: string; ids: string[] }[],
    );
    expect(signedSets).toHaveLength(2);
    for (const signed of signedSets) expect(signed.ids).toEqual([fingerprintA]);

    // Nothing goes out while a signed fingerprint is still awaiting review.
    const early = await post(admin, "/api/notices/dispatch", { caseId, urlId: signedSets[0].id });
    expect(early.status(), await early.text()).toBe(409);
    expect(await early.json()).toEqual({ error: "fingerprints_pending_review" });

    expect((await post(admin, `/api/admin/hashes/${fingerprintA}/approve`, {})).ok()).toBe(true);
    for (const signed of signedSets) {
      const sent = await post(admin, "/api/notices/dispatch", { caseId, urlId: signed.id });
      expect((await sent.json()).dispatched).toBe(true);
    }

    // The audit trail shows each notice carried only what its PDF lists.
    const sentSets = await withAdmin(async (db) =>
      (
        await db.query(
          `SELECT data->'fingerprintIds' AS ids FROM "audit_log"
           WHERE "eventType" = 'NOTICE_SENT' AND "entityId" = ANY($1)`,
          [urlIds],
        )
      ).rows.map((r) => r.ids as string[]),
    );
    expect(sentSets).toEqual([[fingerprintA], [fingerprintA]]);
  });

  test("a signed hash advisory lists only the fingerprints made at creation", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(180_000);
    const caseId = await reportWithFingerprint(page, [`https://www.whatsapp.com/channel/asmita-synthetic-${randomUUID()}`]);
    const [fingerprintA] = await fingerprintIds(caseId);
    const whatsapp = await withAdmin(
      async (db) => (await db.query(`SELECT id FROM "Platform" WHERE name = 'WhatsApp'`)).rows[0].id as string,
    );

    await markTemplateReviewed("HASH_ADVISORY");
    // Signing sends back the reference of the text the preview showed.
    const preview = await page.request.get(`/api/cases/${caseId}/preview-hash-advisory`);
    expect(preview.ok(), await preview.text()).toBe(true);
    const templateRef = preview.headers()["x-notice-template-ref"];
    expect(templateRef).toBeTruthy();
    const signed = await post(page.request, `/api/cases/${caseId}/sign-hash-advisory`, {
      name: "Synthetic Survivor",
      contact: "survivor@example.invalid",
      signature: "Synthetic Survivor",
      platformIds: [whatsapp],
      templateRef,
    });
    expect(signed.ok(), await signed.text()).toBe(true);
    await expectFingerprintRefused(page, caseId);

    const admin = await adminRequest(browser);
    const early = await post(admin, "/api/admin/hashes/dispatch", { caseId, platformIds: [whatsapp] });
    expect(early.status(), await early.text()).toBe(409);
    expect(await early.json()).toEqual({ error: "fingerprints_pending_review" });

    expect((await post(admin, `/api/admin/hashes/${fingerprintA}/approve`, {})).ok()).toBe(true);
    // Approving the last signed fingerprint sends the advisory to the chosen
    // platform; a manual dispatch afterwards sends nothing more.
    const again = await post(admin, "/api/admin/hashes/dispatch", { caseId, platformIds: [whatsapp] });
    expect(again.ok()).toBe(true);
    expect((await again.json()).results[0]).toMatchObject({ dispatched: false, reason: "already_dispatched" });

    const dispatched = await withAdmin(async (db) =>
      (
        await db.query(
          `SELECT "hashSubmissionId" AS id FROM "HashDispatch" d
           JOIN "HashSubmission" h ON h.id = d."hashSubmissionId" WHERE h."caseId" = $1`,
          [caseId],
        )
      ).rows.map((r) => r.id as string),
    );
    expect(dispatched).toEqual([fingerprintA]);
  });
});

test("each link gets its own notice, signed one after another on the review screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
  test.setTimeout(180_000);
  await markTemplateReviewed("IT_RULES_2021");
  await register(page);
  await page.getByLabel("Links where the content appears").fill(
    [`https://www.whatsapp.com/channel/asmita-synthetic-${randomUUID()}`, `https://wa.me/asmita-synthetic-${randomUUID()}`].join("\n"),
  );
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const { caseId } = (await (await createResponse).json()) as { caseId: string };
  const confirmations = async () => withAdmin(async (db) => (await db.query(
    `SELECT 1 FROM audit_log WHERE "entityId" = $1 AND "eventType" = 'NOTICE_SENT' AND data->>'messageType' = 'victim_confirmation'`, [caseId],
  )).rowCount);
  expect(await confirmations()).toBe(0);

  for (const round of [1, 2]) {
    await page.getByLabel("Full name", { exact: true }).fill("Synthetic Survivor");
    await page.getByLabel("Email address").fill("survivor@example.invalid");
    // The signature and the confirmation are given again for every notice.
    await page.getByPlaceholder("Type your full name").fill("Synthetic Survivor");
    await page.getByRole("checkbox", { name: /I confirm that the information above is accurate/ }).check();
    const signed = page.waitForResponse((r) => r.url().endsWith("/sign-notice"));
    await page.getByRole("button", { name: "Sign and submit" }).click();
    expect((await signed).ok()).toBe(true);
    if (round === 1) {
      await expect(page.getByText("Signed. Here is the notice for your next link.")).toBeVisible();
      await expect(page.getByPlaceholder("Type your full name")).toHaveValue("");
      expect(await confirmations()).toBe(0);
    }
  }
  await expect(page).toHaveURL(/\/case\/[^/]+\/confirmation$/, { timeout: 30_000 });
  const signedNotices = await withAdmin((db) =>
    db.query('SELECT 1 FROM "SubmittedUrl" WHERE "caseId" = $1 AND "signedNoticePdf" IS NOT NULL', [caseId]),
  );
  expect(signedNotices.rowCount).toBe(2);
  expect(await confirmations()).toBe(1);
});

test("a form-only link listed first does not hide the notices that can be signed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
  test.setTimeout(180_000);
  await markTemplateReviewed("IT_RULES_2021");
  await register(page);
  // Instagram takes reports only through its own form; WhatsApp gets an emailed notice.
  await page.getByLabel("Links where the content appears").fill(
    [`https://www.instagram.com/p/asmita-synthetic-${randomUUID()}`, `https://wa.me/asmita-synthetic-${randomUUID()}`].join("\n"),
  );
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Continue with remaining reports" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const { caseId } = (await (await createResponse).json()) as { caseId: string };

  await page.getByLabel("Full name", { exact: true }).fill("Synthetic Survivor");
  await page.getByLabel("Email address").fill("survivor@example.invalid");
  await page.getByPlaceholder("Type your full name").fill("Synthetic Survivor");
  await page.getByRole("checkbox", { name: /I confirm that the information above is accurate/ }).check();
  const signed = page.waitForResponse((r) => r.url().endsWith("/sign-notice"));
  await page.getByRole("button", { name: "Sign and submit" }).click();
  expect((await signed).ok()).toBe(true);

  await expect(page).toHaveURL(new RegExp(`/case/${caseId}/confirmation$`), { timeout: 30_000 });
  const rows = await withAdmin((db) =>
    db.query(
      'SELECT s.domain, s."signedNoticePdf" IS NOT NULL AS signed FROM "SubmittedUrl" s WHERE s."caseId" = $1 ORDER BY s.domain',
      [caseId],
    ),
  );
  expect(rows.rows).toEqual([
    { domain: "wa.me", signed: true },
  ]);
});
