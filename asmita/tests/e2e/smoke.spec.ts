import { expect, test } from "@playwright/test";

test("landing and support bar render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Asmita helps/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /CHILDLINE 1098/ })).toBeVisible();
});

test("FAQ page renders English and Hindi launch content", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  await expect(page.getByText("Does Asmita download or view submitted content?")).toBeVisible();
  await expect(page.getByRole("heading", { name: "अस्मिता क्या है?" })).toBeVisible();
});

test("minor pathway has no URL submission form", async ({ page }) => {
  await page.goto("/minor-support");
  await expect(page.getByRole("link", { name: /CHILDLINE 1098/ }).first()).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("minor registration branches before collecting email", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("I am under 18.").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/minor-support$/);
  await expect(page.locator("input[type='email']")).toHaveCount(0);
});

test("full adult flow creates a case and reaches confirmation", async ({ page }, testInfo) => {
  await page.goto("/register");
  await page.getByLabel("I confirm I am 18 or older.").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`adult-${testInfo.project.name}@example.com`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otpPayload = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(otpPayload.devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/);
  await page.getByLabel("Paste one URL per line").fill("https://www.instagram.com/p/abc");
  await expect(page.getByText(/Detected: Instagram/)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Create case" }).click();
  await expect(page).toHaveURL(/\/case\/.+\/confirmation$/);
  await expect(page.getByText(/ASMITA-/)).toBeVisible();
});

test("language toggle persists Hindi preference", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "हिंदी" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
});
