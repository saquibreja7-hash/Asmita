import { expect, test, type Page } from "@playwright/test";

async function registerAdult(page: Page, email: string) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
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

  await cta.click();
  await expect(page).toHaveURL(/\/review-sign$/);
  await expect(page.getByText("Links (1)")).toBeVisible();
  await expect(page.getByText(/Some links could not be accepted/)).toHaveCount(0);
  // No in-flow support button; it lives in the header and footer.
  await expect(page.getByRole("main").getByRole("link", { name: "Support resources" })).toHaveCount(0);
});
