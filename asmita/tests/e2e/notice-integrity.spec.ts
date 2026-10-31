import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { SignJWT } from "jose";
import { withAdmin } from "./support/database";

// ADR 004, M8 + M9: what the survivor signs is exactly what is sent. Each
// signed document records its own fingerprints; dispatch sends only those,
// and only once every one of them is approved.

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
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
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page).toHaveURL(/\/review-sign$/);
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Create case and preview notice" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = (await created.json()) as { caseId: string };
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

// A later fingerprint, added by the survivor after signing.
async function addFingerprint(page: Page, caseId: string) {
  const response = await post(page.request, `/api/cases/${caseId}/hashes`, {
    hashes: [{ hash: randomBytes(32).toString("hex"), quality: 90 }],
    declaration: true,
  });
  expect(response.ok()).toBe(true);
}

async function adminRequest(browser: Browser) {
  const token = await new SignJWT({
    role: "ADMIN", adminRole: "SUPER_ADMIN", ageOver18: true, emailHash: "integrity-admin", namespace: "admin", mfaComplete: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("asmita")
    .setAudience("asmita-web")
    .setSubject("integrity-admin")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("e2e-test-only-jwt-secret-32-chars-long"));
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3001" });
  await context.addCookies([
    { name: "asmita_admin_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return context.request;
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
  await page.getByLabel("Full name").fill("Synthetic Survivor");
  await page.getByLabel("Contact (email or phone)").fill("survivor@example.invalid");
  await page.getByPlaceholder("Type your full name").fill("Synthetic Survivor");
  await page.getByRole("checkbox", { name: /I confirm that the information above is accurate/ }).check();
  const signed = page.waitForResponse((r) => r.url().endsWith("/sign-notice"));
  await page.getByRole("button", { name: "Sign and submit" }).click();
  expect((await signed).ok()).toBe(true);
}

test.describe("notice integrity", () => {
  test("each signed URL notice sends exactly the fingerprints it lists", async ({ page, browser }, testInfo) => {
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

    // Sign the first notice, add a fingerprint, then sign the second.
    await signNextNotice(page, caseId);
    await addFingerprint(page, caseId);
    const [, fingerprintB] = await fingerprintIds(caseId);
    await signNextNotice(page, caseId);

    const signedSets = await withAdmin(async (db) =>
      (
        await db.query(
          'SELECT id, "signedHashSubmissionIds" AS ids FROM "SubmittedUrl" WHERE "caseId" = $1 ORDER BY cardinality("signedHashSubmissionIds")',
          [caseId],
        )
      ).rows as { id: string; ids: string[] }[],
    );
    const [first, second] = signedSets;
    expect(first.ids).toEqual([fingerprintA]);
    expect(second.ids).toEqual([fingerprintA, fingerprintB]);

    // Nothing goes out while a signed fingerprint is still awaiting review.
    const early = await post(admin, "/api/notices/dispatch", { caseId, urlId: first.id });
    expect(early.status(), await early.text()).toBe(409);
    expect(await early.json()).toEqual({ error: "fingerprints_pending_review" });

    for (const id of [fingerprintA, fingerprintB]) {
      expect((await post(admin, `/api/admin/hashes/${id}/approve`, {})).ok()).toBe(true);
    }
    for (const { id } of signedSets) {
      const sent = await post(admin, "/api/notices/dispatch", { caseId, urlId: id });
      expect(sent.ok()).toBe(true);
      expect((await sent.json()).dispatched).toBe(true);
    }

    // The audit trail shows each notice carried only what its PDF lists:
    // fingerprint B, added after the first signature, never rides on it.
    const sentSets = await withAdmin(async (db) =>
      Object.fromEntries(
        (
          await db.query(
            `SELECT "entityId", data->'fingerprintIds' AS ids FROM "audit_log"
             WHERE "eventType" = 'NOTICE_SENT' AND "entityId" = ANY($1)`,
            [urlIds],
          )
        ).rows.map((r) => [r.entityId as string, r.ids as string[]]),
      ),
    );
    expect(sentSets[first.id]).toEqual([fingerprintA]);
    expect(sentSets[second.id]).toEqual([fingerprintA, fingerprintB]);
  });

  test("a signed hash advisory never carries fingerprints added after signing", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(180_000);
    const caseId = await reportWithFingerprint(page, [`https://www.whatsapp.com/channel/asmita-synthetic-${randomUUID()}`]);
    const [fingerprintA] = await fingerprintIds(caseId);
    const whatsapp = await withAdmin(
      async (db) => (await db.query(`SELECT id FROM "Platform" WHERE name = 'WhatsApp'`)).rows[0].id as string,
    );

    await markTemplateReviewed("HASH_ADVISORY");
    const signed = await post(page.request, `/api/cases/${caseId}/sign-hash-advisory`, {
      name: "Synthetic Survivor",
      contact: "survivor@example.invalid",
      signature: "Synthetic Survivor",
      platformIds: [whatsapp],
    });
    expect(signed.ok()).toBe(true);
    await addFingerprint(page, caseId);
    const [, fingerprintB] = await fingerprintIds(caseId);

    const admin = await adminRequest(browser);
    const early = await post(admin, "/api/admin/hashes/dispatch", { caseId, platformIds: [whatsapp] });
    expect(early.status(), await early.text()).toBe(409);
    expect(await early.json()).toEqual({ error: "fingerprints_pending_review" });

    for (const id of [fingerprintA, fingerprintB]) {
      expect((await post(admin, `/api/admin/hashes/${id}/approve`, {})).ok()).toBe(true);
    }
    const sent = await post(admin, "/api/admin/hashes/dispatch", { caseId, platformIds: [whatsapp] });
    expect(sent.ok()).toBe(true);
    expect((await sent.json()).results[0]).toMatchObject({ dispatched: true, hashCount: 1 });

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
