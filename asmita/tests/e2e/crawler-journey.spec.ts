// NOT YET RUN. Written on a Windows machine with no Postgres and no Docker,
// so this spec has never executed. It follows the conventions of
// notice-integrity.spec.ts and needs the usual local Postgres 17
// (E2E_DATABASE_URL, a database ending in _e2e) and ENABLE_CRAWLER=true in
// playwright.config.ts. Run it before relying on it:
//   npx playwright test tests/e2e/crawler-journey.spec.ts --project=chromium
//
// The crawler journey, end to end against the real app: a survivor opts in,
// the crawler service posts a finding through its own route, two analysts
// review it, an analyst previews the representative notice, and dispatch is
// refused while the template is unreviewed and allowed once it is reviewed.
//
// The shared dev server runs with DEV_SKIP_LEGAL_REVIEW=false (as CI does), so
// the "allowed" half plays the human legal reviewer in this throwaway
// database, as notice-integrity.spec.ts does; the dev flag's own bypass is
// covered by tests/unit/crawler-notice.test.ts. Placeholder data only: no real
// site is ever fetched (the app never fetches; there is no crawler process
// here, the spec posts the finding as the crawler would).

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`crawler-${randomUUID()}@example.invalid`);
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
        ctx.fillStyle = (x * 5 + y * 11) % 64 ? "#2a6f4e" : "#d9a441";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

// A case with one link she reported and one fingerprint made on her device.
async function caseWithFingerprint(page: Page) {
  await register(page);
  await page.getByLabel("Links where the content appears").fill(`https://wa.me/asmita-synthetic-${randomUUID()}`);
  await page.locator('input[type="file"]').setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: await syntheticPng(page) });
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  const hashResponse = page.waitForResponse((r) => /\/api\/cases\/[^/]+\/hashes$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = (await created.json()) as { caseId: string };
  expect((await hashResponse).ok()).toBe(true);
  return caseId;
}

async function post(request: APIRequestContext, path: string, data: unknown, method: "post" | "patch" = "post") {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  return request[method](path, { data, headers: { "x-csrf-token": token } });
}

// In this throwaway database the test plays the human legal reviewer.
const markTemplateReviewed = (templateType: string) =>
  withAdmin((db) => db.query(`UPDATE "NoticeTemplate" SET "reviewedByLegal" = true WHERE "templateType" = $1 AND "isActive"`, [templateType]));

// A crawler service key, stored as the issuing script stores it (sha256 only).
async function issueServiceKey() {
  const key = `cwk_${randomBytes(24).toString("hex")}`;
  await withAdmin((db) =>
    db.query(`INSERT INTO "CrawlServiceKey" ("id", "name", "keyHash") VALUES ($1, 'e2e crawler', $2)`, [
      randomUUID(),
      createHash("sha256").update(key).digest("hex"),
    ]),
  );
  return key;
}

async function admin(browser: Browser, sub: string) {
  return (await adminContext(browser, sub)).request;
}

test.describe("crawler journey", () => {
  test("opt-in, a finding from the service route, two-step review, preview, and dispatch gated on legal review", async ({ page, browser, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(240_000);

    const caseId = await caseWithFingerprint(page);
    const first = await admin(browser, "integrity-admin");
    const second = await admin(browser, "admin-1");

    // An analyst approves her fingerprint (only approved ones enter the pool).
    const [hashId] = await withAdmin(async (db) =>
      (await db.query('SELECT id FROM "HashSubmission" WHERE "caseId" = $1', [caseId])).rows.map((r) => r.id as string),
    );
    expect((await post(first, `/api/admin/hashes/${hashId}/approve`, {})).ok()).toBe(true);

    // Opt-in: she signs the crawl authorisation she was shown.
    await markTemplateReviewed("CRAWL_AUTHORISATION");
    const state = await (await page.request.get(`/api/cases/${caseId}/crawl-consent`)).json();
    expect(state).toMatchObject({ status: "none", available: true });
    const signed = await post(page.request, `/api/cases/${caseId}/crawl-consent`, {
      name: "Synthetic Survivor",
      contact: "survivor@example.invalid",
      signature: "Synthetic Survivor",
      templateRef: state.draft.templateRef,
    });
    expect(signed.ok()).toBe(true);

    // A SUPER_ADMIN adds and enables the test host.
    const added = await post(first, "/api/admin/crawl-sources", { domain: "www.whatsapp.com", pageBudget: 10, delayMs: 1000 });
    expect(added.status()).toBe(201);
    const { source } = (await added.json()) as { source: { id: string } };
    expect((await post(first, "/api/admin/crawl-sources", { id: source.id, enabled: true }, "patch")).ok()).toBe(true);

    // The crawler service: pool, then a finding (distance 25 needs two analysts).
    const key = await issueServiceKey();
    const auth = { authorization: `Bearer ${key}` };
    const pool = (await (await request.get("/api/crawler/pool", { headers: auth })).json()) as { fingerprints: Array<{ id: string }> };
    expect(pool.fingerprints).toHaveLength(1);
    const pageUrl = `https://www.whatsapp.com/channel/asmita-crawler-${randomUUID()}`;
    const reported = await request.post("/api/crawler/findings", {
      headers: auth,
      data: {
        runId: "e2e-run",
        findings: [{
          fingerprintId: pool.fingerprints[0].id, pageUrl, imageUrl: "https://cdn.example.net/asmita-synthetic.jpg",
          distance: 25, quality: 90, observedAt: new Date().toISOString(), sourceId: source.id,
        }],
      },
    });
    expect(await reported.json()).toEqual({ results: [{ status: "accepted" }] });

    // The list carries no address; two different analysts approve.
    const listed = await (await first.get(`/api/admin/findings?caseId=${caseId}`)).text();
    expect(listed).not.toContain("asmita-crawler-");
    const findingId = (JSON.parse(listed) as { findings: Array<{ id: string }> }).findings[0].id;
    const review = (r: APIRequestContext) => post(r, `/api/admin/findings/${findingId}/review`, { decision: "approve" });
    expect(await (await review(first)).json()).toEqual({ ok: true, status: "AWAITING_SECOND_REVIEW" });
    const again = await review(first);
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: "second_reviewer_required" });
    expect(await (await review(second)).json()).toMatchObject({ ok: true, status: "APPROVED", createdUrl: true });

    // Unreviewed representative template: preview and dispatch both refuse.
    const preview = () => post(second, `/api/admin/findings/${findingId}/notice/preview`, { caseId });
    const blocked = await preview();
    expect(blocked.status()).toBe(409);
    expect(await blocked.json()).toEqual({ error: "template_not_reviewed" });
    const blockedSend = await post(second, `/api/admin/findings/${findingId}/notice/dispatch`, { caseId, contentDigest: "0".repeat(64) });
    expect(await blockedSend.json()).toEqual({ error: "template_not_reviewed" });

    // Reviewed: the preview is a recorded reveal, and dispatch sends exactly it.
    await markTemplateReviewed("CRAWL_REPRESENTATIVE_NOTICE");
    const shown = await preview();
    expect(shown.ok()).toBe(true);
    const notice = (await shown.json()) as { body: string; emailBody: string; contentDigest: string; transport: string };
    expect(notice.transport).toBe("email");
    expect(notice.body).toContain(pageUrl);
    expect(notice.emailBody).not.toContain(pageUrl);
    const sent = await post(second, `/api/admin/findings/${findingId}/notice/dispatch`, { caseId, contentDigest: notice.contentDigest });
    expect(await sent.json()).toMatchObject({ dispatched: true, transport: "email" });
    const reveals = await withAdmin(async (db) =>
      (await db.query(`SELECT count(*)::int AS n FROM "AdminAccessLog" WHERE "entityId" = $1 AND "action" = 'finding_notice_previewed'`, [findingId])).rows[0].n as number,
    );
    expect(reveals).toBeGreaterThanOrEqual(1);

    // After reload the console shows it as sent, and her case page lists it as found by Asmita.
    const console_ = await adminContext(browser, "admin-1");
    const adminPage = await console_.newPage();
    await adminPage.goto(`/admin/findings/${findingId}`);
    await expect(adminPage.getByText(/Representative notice sent on/)).toBeVisible();
    await page.goto(`/case/${caseId}`);
    await expect(page.getByText("Found by Asmita")).toBeVisible();
    await expect(page.getByText("Asmita sent the takedown notice on")).toBeVisible();
  });
});
