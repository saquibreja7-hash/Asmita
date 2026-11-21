// WP110 (research-tools spec, Track A): the HMA signal feed end to end against
// the real app and its throwaway Postgres. One journey, in the style of
// crawler-journey.spec.ts: a partner is onboarded through the real application
// flow, an admin issues it a key (shown once), a survivor registers and
// submits a synthetic fingerprint on her case, an analyst approves it and she
// ticks the partner-sharing agreement — the consented synthetic fingerprint of
// the spec's done-when — and the partner key then reads it from
// GET /api/partner/v1/signals. Withdrawing her agreement must turn the next
// read into exactly one explicit deletion record. Synthetic data only: the
// image is drawn on a canvas in the browser, the hash never leaves her device,
// and no real site, person or platform is named.

import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`signals-${randomUUID()}@example.invalid`);
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
        ctx.fillStyle = (x * 7 + y * 3) % 64 ? "#1f6f66" : "#c9873f";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

// A case with one synthetic fingerprint made on her device (never uploaded).
// The link must be on a platform Asmita knows (wa.me, like the crawler
// journey): an unknown platform deliberately takes a different, notice-free
// flow that never reaches the review step.
async function caseWithFingerprint(page: Page) {
  await register(page);
  await page.getByLabel("Links where the content appears").fill(`https://wa.me/asmita-signals-${randomUUID()}`);
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

async function post(request: APIRequestContext, path: string, data: unknown, method: "post" | "delete" = "post") {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  return request[method](path, { data, headers: { "x-csrf-token": token } });
}

// In this throwaway database the test plays the human legal reviewer, exactly
// as crawler-journey.spec.ts does for the crawl templates.
const markTemplateReviewed = (templateType: string) =>
  withAdmin((db) => db.query(`UPDATE "NoticeTemplate" SET "reviewedByLegal" = true WHERE "templateType" = $1 AND "isActive"`, [templateType]));

test.describe("partner signals (WP110)", () => {
  test("admin-issued key reads a consented synthetic fingerprint from /signals, and withdrawal becomes an explicit deletion", async ({ page, browser, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(240_000);

    // 1. A platform joins through the public form and an admin approves it.
    //    (The public route answers only { ok: true } — the id never leaves the
    //    console — so the spec reads it back the way the admin page does.)
    const domain = `signals-${randomUUID().slice(0, 8)}.example.test`;
    const application = await post(request, "/api/partners", {
      organisationName: "Example Signal Platform",
      platformName: "Example Signal Platform",
      website: `https://${domain}`,
      platformType: "FORUM",
      userBase: "UNDER_100K",
      contactName: "Example Contact",
      contactRole: "Trust & Safety",
      contactEmail: `contact@${domain}`,
      interests: ["FINGERPRINT_ALERTS", "REUPLOAD_CHECKS"],
      authorised: true,
    });
    expect(application.ok()).toBe(true);
    const [applicationId] = await withAdmin(async (db) =>
      (await db.query('SELECT id FROM "PlatformPartnerApplication" WHERE "websiteDomain" = $1', [domain])).rows.map((r) => r.id as string),
    );
    expect(applicationId).toBeDefined();

    const admin = (await adminContext(browser, "integrity-admin")).request;
    const approved = await post(admin, `/api/admin/partners/applications/${applicationId}`, { action: "approve" });
    expect(approved.ok()).toBe(true);
    const { partnerId } = (await approved.json()) as { partnerId: string };

    // 2. The admin issues a partner key through the console's route; it is
    //    shown exactly once and both scopes are ticked (the form's default).
    const issued = await post(admin, `/api/admin/partners/${partnerId}/keys`, { label: "e2e signals key", scopes: ["feed", "outcomes"] });
    expect(issued.ok()).toBe(true);
    const { key } = (await issued.json()) as { key: string };
    expect(key).toMatch(/^ppk_[0-9a-f]{48}$/);
    const auth = { authorization: `Bearer ${key}` };

    // 3. A survivor files a case with a synthetic fingerprint; an analyst
    //    approves it; she then ticks the partner-sharing agreement.
    const caseId = await caseWithFingerprint(page);
    const [hashId] = await withAdmin(async (db) =>
      (await db.query('SELECT id FROM "HashSubmission" WHERE "caseId" = $1', [caseId])).rows.map((r) => r.id as string),
    );
    expect((await post(admin, `/api/admin/hashes/${hashId}/approve`, {})).ok()).toBe(true);

    await markTemplateReviewed("PARTNER_SHARING_CONSENT");
    const state = (await (await page.request.get(`/api/cases/${caseId}/partner-share`)).json()) as { draft: { templateRef: string } };
    expect(state.draft).toBeDefined();
    const agreed = await post(page.request, `/api/cases/${caseId}/partner-share`, { agreed: true, templateRef: state.draft.templateRef });
    expect(agreed.ok()).toBe(true);

    // 4. The partner key reads the HMA signal feed: one live record.
    const signals = (await (await request.get("/api/partner/v1/signals", { headers: auth })).json()) as {
      checkpoint: string;
      has_more: boolean;
      records: Array<{ id: string; signal_type: string; hash: string | null; deleted: boolean; updated_at: number; tags: string[] }>;
    };
    expect(signals.has_more).toBe(false);
    expect(signals.records).toHaveLength(1);
    const record = signals.records[0]!;
    expect(record).toEqual({
      id: hashId,
      signal_type: "pdq",
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      deleted: false,
      updated_at: expect.any(Number),
      tags: ["asmita", "ncii", "survivor_consented"],
    });
    // The two feeds publish the same hash.
    const feed = (await (await request.get("/api/partner/v1/fingerprints", { headers: auth })).json()) as {
      events: Array<{ type: string; fingerprintId: string; hash?: string }>;
    };
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]!.hash).toBe(record.hash);

    // 5. She withdraws her agreement. The feed must tell the platform to
    //    delete: one explicit tombstone, no live record, no hash — and the
    //    ADD that preceded it is never served again.
    const withdrawn = await post(page.request, `/api/cases/${caseId}/partner-share`, {}, "delete");
    expect(withdrawn.ok()).toBe(true);

    const after = (await (await request.get("/api/partner/v1/signals", { headers: auth })).json()) as {
      checkpoint: string;
      has_more: boolean;
      records: Array<{ id: string; hash: string | null; deleted: boolean; signal_type: string }>;
    };
    expect(after.has_more).toBe(false);
    expect(after.records).toEqual([
      { id: hashId, signal_type: "pdq", hash: null, deleted: true, updated_at: expect.any(Number), tags: ["asmita", "ncii", "survivor_consented"] },
    ]);

    // A key without the feed scope is refused on both feeds (WP110 scopes).
    const narrowIssued = await post(admin, `/api/admin/partners/${partnerId}/keys`, { label: "e2e outcomes-only key", scopes: ["outcomes"] });
    const narrowKey = ((await narrowIssued.json()) as { key: string }).key;
    const narrow = { authorization: `Bearer ${narrowKey}` };
    const denied = await request.get("/api/partner/v1/signals", { headers: narrow });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toEqual({ error: "insufficient_scope" });
  });
});
