import { expect, test } from "@playwright/test";

async function register(page: import("@playwright/test").Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`hash-${Date.now()}@example.org`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otp = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(otp.devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

async function syntheticPng(page: import("@playwright/test").Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = (x + y) % 32 ? "#55aacc" : "#ee7733";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

test("AI check exposes an age-gated local image picker", async ({ page }) => {
  await page.goto("/check-image");
  const picker = page.locator('input[type="file"]');
  await expect(picker).toHaveCount(1);
  await expect(picker).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(picker).toBeEnabled();
});

test("registered adult can generate a fingerprint and submit it with a URL", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page);
  await page.getByLabel("Links where the content appears").fill("https://www.instagram.com/p/synthetic-test");
  const picker = page.locator('input[type="file"]');
  await expect(picker).toHaveCount(1);
  await picker.setInputFiles({
    name: "synthetic.png", mimeType: "image/png",
    buffer: await syntheticPng(page),
  });
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  const hashResponse = page.waitForResponse((r) => /\/api\/cases\/[^/]+\/hashes$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue to review" }).click();
  expect((await createResponse).ok()).toBe(true);
  const hashResult = await hashResponse;
  expect(hashResult.ok()).toBe(true);
  expect((await hashResult.json()).results[0].ok).toBe(true);
  await expect(page).toHaveURL(/\/handoff\/[^/]+$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByText("Digital fingerprints")).toBeVisible();
});

test("hash-only registration offers a platform handoff", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic.png", mimeType: "image/png",
    buffer: await syntheticPng(page),
  });
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByRole("checkbox", { name: /Instagram \/ Meta/ }).check();
  await page.getByLabel(/I declare/).check();
  const hashResponse = page.waitForResponse((r) => /\/api\/cases\/[^/]+\/hashes$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue to review" }).click();
  expect((await hashResponse).ok()).toBe(true);
  await expect(page.getByRole("link", { name: /Instagram \/ Meta/ })).toBeVisible();
  await page.getByRole("link", { name: /case dashboard/i }).click();
  await expect(page).toHaveURL(/\/case\/[^/]+$/);
  await expect(page.getByText("Digital fingerprints")).toBeVisible();
});

test("the fingerprint section is honest about what a fingerprint does and points to StopNCII", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page);
  await expect(page.getByText(/does not remove anything by itself/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open StopNCII.org" })).toHaveAttribute("href", "https://stopncii.org/");
  await expect(page.getByText(/find and remove matching content proactively/)).toHaveCount(0);
});
