import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { withAdmin } from "./support/database";

test("OTP accepts a complete autofill code while displaying six individual digits", async ({ page }) => {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`otp-${randomUUID()}@example.invalid`);
  const response = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = await (await response).json();
  await expect(page.getByRole("group", { name: "Verification code digits" }).locator("input")).toHaveCount(6);
  await page.getByLabel("6-digit code").focus();
  await page.keyboard.type("a");
  await expect(page.getByLabel("6-digit code")).toHaveValue("");
  await page.keyboard.type(devOtp);
  for (let i = 1; i < 6; i++) await expect(page.getByLabel(`Digit ${i + 1}`)).toHaveValue(devOtp[i]);
  await page.getByLabel("6-digit code").evaluate((element, code: string) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text", code);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, devOtp);
  for (let i = 1; i < 6; i++) await expect(page.getByLabel(`Digit ${i + 1}`)).toHaveValue(devOtp[i]);
  await page.getByLabel("6-digit code").fill("");
  await page.getByLabel("6-digit code").fill(devOtp);
  for (let i = 1; i < 6; i++) await expect(page.getByLabel(`Digit ${i + 1}`)).toHaveValue(devOtp[i]);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/);
});

test("a YouTube case without a verified contact does not offer signing or redirect to a form", async ({ page }, testInfo) => {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`youtube-${randomUUID()}@example.invalid`);
  const response = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = await (await response).json();
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Links where the content appears").fill("https://youtube.com/watch?v=synthetic-example");
  await expect(page.getByText("YouTube", { exact: true })).toBeVisible();
  await expect(page.getByText("Works with", { exact: true })).toHaveCount(0);
  await page.getByLabel(/I declare/).check();
  const created = page.waitForResponse((res) => res.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const { caseId } = await (await created).json();
  await withAdmin(async (db) => {
    await db.query('UPDATE "SubmittedUrl" SET "platformId" = NULL WHERE "caseId" = $1', [caseId]);
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/case/${caseId}/confirmation`);
  await expect(page.getByRole("heading", { name: "You are done for now." })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Open dashboard", exact: true }).filter({ visible: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("confirmation-mobile.png"), fullPage: true });
  await page.goto(`/case/${caseId}`);
  await expect(page.getByRole("link", { name: /review.*sign notice/i })).toHaveCount(0);
  const dashboardUrl = page.url();
  await page.goto(`${dashboardUrl}/sign`);
  await expect(page).toHaveURL(dashboardUrl);
});
