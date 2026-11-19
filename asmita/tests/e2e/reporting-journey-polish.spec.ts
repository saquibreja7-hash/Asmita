import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { withAdmin } from "./support/database";

test("the code arrives in one box: typed key by key, pasted, and autofilled", async ({ page }) => {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your email address." })).toBeFocused();
  await page.getByLabel("Email address").fill(`otp-${randomUUID()}@example.invalid`);
  const response = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await response).json()) as { devOtp: string };
  await expect(page.getByRole("heading", { name: "Enter the code we sent." })).toBeFocused();

  // One single box (WP40 A3), no per-digit boxes left.
  const code = page.getByLabel("6-digit code");
  await expect(code.locator("input")).toHaveCount(0);
  await expect(page.locator("#otp")).toHaveCount(1);

  // Typing non-digits does nothing; typing the code fills it.
  await code.click();
  await page.keyboard.type("a-");
  await expect(code).toHaveValue("");
  await page.keyboard.type(devOtp);
  await expect(code).toHaveValue(devOtp);

  // A paste lands in one action: insertText is the input event a paste fires,
  // with all six digits in a single multi-character insertion.
  await code.fill("");
  await code.focus();
  await page.evaluate((text: string) => document.execCommand("insertText", false, text), devOtp);
  await expect(code).toHaveValue(devOtp);

  // And so does an autofill-style fill.
  await code.fill("");
  await code.fill(devOtp);
  await expect(code).toHaveValue(devOtp);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/);
});

test("a wrong code is announced as an alert and focus returns to the box", async ({ page }) => {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`otp-${randomUUID()}@example.invalid`);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 30_000 });

  // A code that cannot match (the real one is random six digits).
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The code did not match. Please try again.");
  await expect(page.getByLabel("6-digit code")).toBeFocused();
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
