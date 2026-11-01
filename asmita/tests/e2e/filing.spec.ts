import { expect, test, type Page } from "@playwright/test";

async function registerAdult(page: Page, email: string) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(email);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

test("each pasted line is checked where it is typed, and only valid links reach review", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const detectCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/platforms/detect")) detectCalls.push(request.url());
  });
  await registerAdult(page, `filing-${Date.now()}-${testInfo.project.name}@filing-${testInfo.workerIndex}.example.com`);

  const links = page.getByLabel("Links where the content appears");
  const checks = page.locator("#url-checks");
  const cta = page.getByRole("button", { name: "Continue to review" });

  // Plain text is not a link: it is flagged on its line and cannot be filed.
  await links.fill("Digital fingerprint");
  await expect(checks.getByText("Not a web link")).toBeVisible();
  await page.getByText(/I declare that I am the person depicted/).click();
  await expect(cta).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Add at least one link or fingerprint" })).toBeVisible();

  // A link without https:// is accepted, a repeat is flagged, and bad lines are left out.
  await links.fill("instagram.com/p/abc\nhttps://www.instagram.com/p/abc\nDigital fingerprint");
  await expect(checks.getByText("Instagram / Meta")).toBeVisible();
  await expect(checks.getByText("Already listed")).toBeVisible();
  await expect(page.getByText(/Lines marked in red will be left out/)).toBeVisible();
  await expect(cta).toBeEnabled();
  expect(detectCalls).toEqual([]);

  // No in-flow support button; it lives in the header and footer.
  await expect(page.getByRole("main").getByRole("link", { name: "Support resources" })).toHaveCount(0);

  // The case is created on arrival at review, with only the valid link.
  const created = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await cta.click();
  const response = await created;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().urls).toEqual(["https://instagram.com/p/abc"]);
  // Instagram takes reports through its own form, so there is nothing to sign
  // yet: the survivor is told they are done for now.
  await expect(page).toHaveURL(/\/case\/[^/]+\/confirmation$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "You are done for now." })).toBeVisible();
  await expect(page.getByText(/24-hour clock/)).toHaveCount(0);
});

test("links can be added before the email code, and nothing reaches the server until then", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    // Only calls that could carry what the survivor typed.
    if (/\/api\/(cases|profile|platforms|hashes)/.test(request.url())) apiCalls.push(new URL(request.url()).pathname);
  });

  await page.goto("/eligibility");
  await page.getByText("I am in the content").click();
  await page.getByText(/^Yes - it shows me/).click();
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/);

  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=asmita-synthetic");
  await page.getByText(/I declare that I am the person depicted/).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(apiCalls).toEqual([]);

  // The age questions were answered already: the email step comes first.
  await expect(page.getByText("I am 18 years of age or older.")).toHaveCount(0);
  await page.getByLabel("Email address").fill(`early-${Date.now()}-${testInfo.project.name}@early-${testInfo.workerIndex}.example.com`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await created).request().postDataJSON().urls).toEqual(["https://www.youtube.com/watch?v=asmita-synthetic"]);
  await expect(page).toHaveURL(/\/(review-sign|case\/[^/]+\/confirmation)$/, { timeout: 30_000 });
});

test("someone under 18 when the content was made goes to the minor pathway", async ({ page }) => {
  await page.goto("/eligibility");
  await page.getByText("I am in the content").click();
  await page.getByText(/^Yes - it shows me/).click();
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was under 18, or I am not sure.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/minor-support$/);
  await expect(page.locator("textarea")).toHaveCount(0);

  // Without answering, the links page is not reachable.
  await page.context().clearCookies();
  await page.goto("/submit");
  await expect(page).toHaveURL(/\/start$/);
});
