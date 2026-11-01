import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// Local-only diagnostic. This checks registration and its handoff boundary;
// it deliberately does not claim to prove real notice delivery or removal.
test("URL report registers locally and exposes the unavailable notice-preview boundary", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
      externalRequests.push(url.origin);
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`audit-${randomUUID()}@example.invalid`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otp = await otpResponse;
  expect(otp.ok()).toBe(true);
  const otpBody = await otp.json();
  expect(otpBody.devOtp).toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(otpBody.devOtp);
  const verificationResponse = page.waitForResponse("**/api/auth/verify-otp");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect((await verificationResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });

  // This is a synthetic string, never a URL to open or fetch.
  await page.getByLabel("Links where the content appears").fill(`https://www.instagram.com/p/asmita-synthetic-${randomUUID()}/`);
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  const previewResponse = page.waitForResponse((r) => r.url().endsWith("/preview-notice"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const createdBody = await created.json();
  expect(createdBody.referenceNumber).toMatch(/^ASMITA-/);
  const preview = await previewResponse;
  // Instagram is FORM_ONLY in the seeded platform directory (no verified
  // grievance email), so there is no emailed notice to preview.
  expect(preview.status()).toBe(404);
  expect(await preview.json()).toEqual({ error: "form_only_platform" });
  await expect(page).toHaveURL(new RegExp(`/case/${createdBody.caseId}/confirmation$`), { timeout: 30_000 });
  await expect(page.getByText(createdBody.referenceNumber).first()).toBeVisible();
  const caseResponse = await page.request.get(`/api/cases/${createdBody.caseId}`);
  expect(caseResponse.ok()).toBe(true);
  const record = await caseResponse.json();
  expect(record.urls).toHaveLength(1);
  expect(record.urls[0].status).toBe("NOTICE_QUEUED");
  expect(externalRequests).toEqual([]);
  await testInfo.attach("reporting-boundary", {
    body: JSON.stringify({ environment: "local-memory", caseCreated: true, previewStatus: 404, previewError: "no_eligible_url", noticeDeliveryVerified: false, browserExternalRequests: externalRequests }, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("case-dashboard.png"), fullPage: true });
});
