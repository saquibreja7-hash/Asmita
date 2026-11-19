import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { withAdmin } from "./support/database";

// WP40: forms, errors and focus in the survivor flow. The registration and
// feedback journeys run on every project; the sign journey needs the
// throwaway database and runs once, like the other database journeys.

async function registerToOtpStep(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your email address." })).toBeFocused();
  await page.getByLabel("Email address").fill(`focus-${randomUUID()}@example.invalid`);
}

test("a failed code request is announced as an alert", async ({ page }) => {
  await registerToOtpStep(page);
  await page.route("**/api/auth/request-otp", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByRole("alert")).toContainText(/try again in a little while/i);
  // The email step stays; she can retry.
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("Enter submits the feedback form from the keyboard", async ({ page }) => {
  await page.goto("/feedback");
  const reference = page.getByLabel("Case reference");
  await reference.fill("ASMITA-2026-7K3M9Q");
  await reference.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Thank you. Your feedback was recorded." })).toBeVisible();
});

test("starting the helpline call moves focus to the new screen's heading", async ({ page }) => {
  // TalkToUs: starting the call is a step change, so focus moves to the new
  // screen's heading (WP40 A11). The E2E server has no voice key, so the
  // call fails fast into the error screen — the heading focus already moved.
  await page.goto("/talk");
  await page.getByRole("button", { name: "Continue and start the call" }).click();
  await expect(page.getByRole("heading", { name: "Helpline call" })).toBeFocused();
});

test("Enter signs the notice from the review screen, and each missing field is announced and focused", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
  test.setTimeout(180_000);
  // This throwaway database is reset per run; this test plays the human legal
  // reviewer, as notice-integrity.spec.ts does.
  await withAdmin(async (db) => {
    await db.query('UPDATE "NoticeTemplate" SET "reviewedByLegal" = true WHERE "templateType" = $1 AND "isActive"', ["IT_RULES_2021"]);
  });

  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`sign-${randomUUID()}@example.invalid`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await expect(page.getByRole("heading", { name: "Enter the code we sent." })).toBeFocused();
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });

  await page.getByLabel("Links where the content appears").fill(`https://wa.me/asmita-synthetic-${randomUUID()}`);
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const { caseId } = (await (await createResponse).json()) as { caseId: string };

  // The sign screen is a step change: its heading takes the focus (WP40 A11).
  await expect(page.getByRole("heading", { name: "Review and sign your notice." })).toBeFocused();

  // Submitting with the form still empty announces the first problem and
  // focuses it (WP40 A9/A10); the button was never disabled to block it.
  const name = page.getByLabel("Full name", { exact: true });
  const contact = page.getByLabel("Email address");
  await name.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Please type your full name. Your full name is your signature." })).toBeVisible();
  await expect(name).toBeFocused();

  await name.fill("Synthetic Survivor");
  await name.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Please enter a valid email address, like you@example.com." })).toBeVisible();
  await expect(contact).toBeFocused();

  // Everything in place, Enter in the contact field signs and submits.
  await contact.fill("survivor@example.invalid");
  await page.getByRole("checkbox", { name: /I confirm that the information above is accurate/ }).check();
  const signed = page.waitForResponse((r) => r.url().endsWith("/sign-notice"));
  await contact.press("Enter");
  expect((await signed).ok()).toBe(true);
  await expect(page).toHaveURL(new RegExp(`/case/${caseId}/confirmation$`), { timeout: 30_000 });
});
