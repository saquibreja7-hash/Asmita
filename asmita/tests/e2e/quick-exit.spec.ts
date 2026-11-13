import { expect, test, type Page } from "@playwright/test";

/*
 * Safe access (survivor-security roadmap, Phase 1 item 2): Quick Exit must
 * blank the screen, sign the survivor out, and land on a neutral page — via
 * the button and via double-Escape — and an idle dashboard must sign itself
 * out. The neutral destination is an internal page in this environment
 * (NEXT_PUBLIC_QUICK_EXIT_URL in playwright.config.ts) so the suite never
 * depends on the outside internet.
 */

async function completeAdultRegistration(page: Page, email: string) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(email);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otpPayload = (await (await otpResponse).json()) as { devOtp: string };
  expect(otpPayload.devOtp).toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(otpPayload.devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

async function createCaseAndOpenDashboard(page: Page) {
  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=quick-exit-synthetic");
  await expect(page.locator("#url-checks").getByText("YouTube", { exact: true })).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = (await created.json()) as { caseId: string };
  await page.goto(`/case/${caseId}`);
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();
  return caseId;
}

async function expectSignedOut(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "asmita_session")).toBeUndefined();
}

test("the Quick exit button signs the survivor out and lands on a neutral page", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `quickexit-btn-${Date.now()}-${testInfo.workerIndex}@example.com`);
  const caseId = await createCaseAndOpenDashboard(page);

  await page.getByRole("button", { name: "Quick exit" }).click();

  await expect(page).toHaveURL(/\/how-it-works$/, { timeout: 15_000 });
  await expectSignedOut(page);

  // The signed-out case page bounces to /start: nothing is reachable again.
  await page.goto(`/case/${caseId}`);
  await expect(page).toHaveURL(/\/start/, { timeout: 15_000 });
});

test("double-Escape does the same thing from any victim page", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `quickexit-esc-${Date.now()}-${testInfo.workerIndex}@example.com`);
  await createCaseAndOpenDashboard(page);

  // One Escape does nothing; the second inside the window exits.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/case\//, { timeout: 2_000 });
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/\/how-it-works$/, { timeout: 15_000 });
  await expectSignedOut(page);
});

test("an idle dashboard signs the survivor out by itself", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await completeAdultRegistration(page, `quickexit-idle-${Date.now()}-${testInfo.workerIndex}@example.com`);
  await createCaseAndOpenDashboard(page);

  // NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS is 60s in this environment: the idle
  // exit lands on the public home page, signed out.
  await expect(page).toHaveURL("/", { timeout: 120_000 });
  await expectSignedOut(page);
});
