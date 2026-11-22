import { expect, test } from "@playwright/test";

async function register(page: import("@playwright/test").Page) {
  await page.goto("/register");
  await page.getByRole("radio", { name: "I am 18 years of age or older." }).check();
  await page.getByRole("radio", { name: "I was 18 or older." }).check();
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

test.beforeEach(async ({ page }) => {
  // Pin the motion environment like tests/e2e/accessibility.spec.ts does, so
  // scroll-into-view is instant (the site switches its smooth scrolling off
  // under prefers-reduced-motion) and the bottom-of-page clicks are
  // deterministic.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

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
  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=asmita-synthetic-test");
  // Wait for the debounced link checks (WP40 A7: they render from the settled
  // text ~600 ms after typing). Hashing a small file can finish inside that
  // window, and then the first click blurs the still-focused textarea, the
  // blur flush renders the checks and removes the platform question, and the
  // reflow moves the page under the pointer so the click misses. Waiting for
  // the app's own checks list makes the click land on a settled page.
  await expect(page.locator("#url-checks")).toBeVisible();
  // WP42: the hashing runs in the Web Worker, off the page's main thread.
  // Its script is a same-origin file the bundler emits, so it loads with 200
  // under the page's CSP (worker-src 'self').
  const workerScript = page.waitForResponse(
    (r) => /(hash[._-]?worker|turbopack-worker)/i.test(r.url()) && r.status() === 200,
    { timeout: 30_000 },
  );
  const picker = page.locator('input[type="file"]');
  await expect(picker).toHaveCount(1);
  await picker.setInputFiles({
    name: "synthetic.png", mimeType: "image/png",
    buffer: await syntheticPng(page),
  });
  expect((await workerScript).ok()).toBe(true);
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  const hashResponse = page.waitForResponse((r) => /\/api\/cases\/[^/]+\/hashes$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = await created.json();
  const hashResult = await hashResponse;
  expect(hashResult.ok()).toBe(true);
  expect((await hashResult.json()).results[0].ok).toBe(true);
  await page.goto(`/case/${caseId}`);
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
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByText("The fingerprint you created has not been sent to these platforms.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Instagram \/ Meta/ })).toBeVisible();
});

test("the fingerprint section is honest about what a fingerprint does and points to StopNCII", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page);
  // The section is optional and starts folded: open it as a survivor would.
  await page.locator("summary").filter({ hasText: "Digital fingerprint" }).click();
  await expect(page.getByText(/does not remove anything by itself/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open StopNCII.org" })).toHaveAttribute("href", "https://stopncii.org/");
  await expect(page.getByText(/find and remove matching content proactively/)).toHaveCount(0);
});

test("hash-only survivor who does not know where the image is gets StopNCII guidance, nothing sent", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic.png", mimeType: "image/png",
    buffer: await syntheticPng(page),
  });
  await expect(page.getByText(/ready.*quality|fingerprint ready/i)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  // The button is never disabled to block validation (WP40 A9): without a
  // platform choice, submitting focuses the platform question and says why.
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByRole("group", { name: "Which platforms is the content on?" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: /Choose where the image is/ })).toBeVisible();
  const unsure = page.getByRole("checkbox", { name: /I am not sure where it is/ });
  await unsure.check();
  // Choosing a platform clears "not sure", and the other way round.
  await page.getByRole("checkbox", { name: /Instagram \/ Meta/ }).check();
  await expect(unsure).not.toBeChecked();
  await unsure.check();
  await expect(page.getByRole("checkbox", { name: /Instagram \/ Meta/ })).not.toBeChecked();
  let caseCreated = false;
  page.on("request", (r) => { if (r.url().includes("/api/cases/")) caseCreated = true; });
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByRole("heading", { name: "What you can do now" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open StopNCII/ })).toHaveAttribute("href", "https://stopncii.org/");
  expect(caseCreated).toBe(false);
  await page.getByRole("button", { name: "Back to choose a platform" }).click();
  await expect(unsure).toBeChecked();
});
