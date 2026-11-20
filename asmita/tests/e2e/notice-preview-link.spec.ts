import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { withAdmin } from "./support/database";

// WP44 A2: Android Chrome draws no PDF inside an <iframe>, so both sign
// screens pair the preview frame with a visible "Open the notice (PDF)"
// link. That link must carry exactly the URL the frame holds, so it always
// opens the same document the survivor is about to sign.

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`preview-${randomUUID()}@example.invalid`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

// In this throwaway database the test plays the human legal reviewer.
const markTemplateReviewed = (templateType: string) =>
  withAdmin((db) =>
    db.query(`UPDATE "NoticeTemplate" SET "reviewedByLegal" = true WHERE "templateType" = $1 AND "isActive"`, [
      templateType,
    ]),
  );

async function expectLinkMirrorsFrame(page: Page, caseId: string) {
  const frame = page.locator('iframe[title="Notice preview"]');
  const link = page.getByRole("link", { name: "Open the notice (PDF)" });
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await expect(link).toBeVisible();
  const src = await frame.getAttribute("src");
  const href = await link.getAttribute("href");
  expect(src).toBeTruthy();
  expect(href).toBe(src);
  expect(href).toContain(`/api/cases/${caseId}/preview-notice`);
  expect(await link.getAttribute("target")).toBe("_blank");
  const rel = (await link.getAttribute("rel")) ?? "";
  expect(rel).toContain("noopener");
  expect(rel).toContain("noreferrer");
}

test("the Open the notice (PDF) link opens exactly the framed preview on both sign screens", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
  test.setTimeout(180_000);
  await markTemplateReviewed("IT_RULES_2021");
  await register(page);
  await page.getByLabel("Links where the content appears").fill(`https://wa.me/asmita-synthetic-${randomUUID()}`);
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const { caseId } = (await (await createResponse).json()) as { caseId: string };

  // The case-creation sign screen: the frame with the link beside it.
  await expectLinkMirrorsFrame(page, caseId);

  // The case sign page shows the same pair for the same notice.
  await page.goto(`/case/${caseId}/sign`);
  await expectLinkMirrorsFrame(page, caseId);
});
