// The "Watch for my images" journey (watch-and-verify WP22), end to end
// against the real app: the start page's second option, the sign-in with the
// age check, the on-device fingerprinting, the one tick, and the watch page.
// The shared dev server runs with DEV_SKIP_LEGAL_REVIEW=false (as CI does),
// so this spec plays the human legal reviewer for the watch authorisation in
// this throwaway database, exactly as crawler-journey.spec.ts and
// notice-integrity.spec.ts do. Placeholder data only: a synthetic image made
// in the page, a fixture email, no real site is ever fetched (the app never
// fetches; no crawler process runs in E2E).
//
// Run it before relying on it:
//   npx playwright test tests/e2e/watch-journey.spec.ts --project=chromium

import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { withAdmin } from "./support/database";

// In this throwaway database the test plays the human legal reviewer.
const markTemplateReviewed = (templateType: string) =>
  withAdmin((db) => db.query(`UPDATE "NoticeTemplate" SET "reviewedByLegal" = true WHERE "templateType" = $1 AND "isActive"`, [templateType]));

async function syntheticPng(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = (x * 7 + y * 13) % 64 ? "#1f5f8b" : "#c2782a";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

// The registration flow with the age check (and its minor routing), the email
// and the one-time code, as the complaint flow uses them.
async function signInForWatch(page: Page) {
  await page.goto("/watch");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`watch-${randomUUID()}@example.invalid`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/watch$/, { timeout: 30_000 });
}

test("the start page offers watching next to filing", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Watch for my images" })).toBeVisible();
});

test("watch sign-up through to the watch page", async ({ page }) => {
  // The watch-only authorisation must be legally reviewed before she can tick.
  await markTemplateReviewed("WATCH_AUTHORISATION");

  await signInForWatch(page);

  // The fingerprinting step: the image is hashed on her device and only the
  // fingerprint code is sent. No link is ever asked for.
  await page.locator("input[type=file]").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: await syntheticPng(page) });
  await expect(page.getByText(/Fingerprint created/i)).toBeVisible();
  const createWatch = page.waitForResponse((r) => r.url().endsWith("/api/watch") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue" }).click();
  const created = await createWatch;
  expect(created.ok()).toBe(true);

  // One tick: the watch-only authorisation. Ticking records the WATCH_ONLY
  // consent and takes her to her watch page.
  await expect(page.getByText("Search the web for copies of these images and alert me.")).toBeVisible();
  await page.locator("#crawl-tick").check();
  await page.waitForURL(/\/case\//, { timeout: 30_000 });

  // The watch page: watching since today, no copies found so far.
  await expect(page.getByText("Watching since")).toBeVisible();
  await expect(page.getByText("No copies found so far")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add more images" })).toBeVisible();

  // Nothing is ever sent to a platform from a watch: the page promises that.
  await expect(page.getByText("Nothing is sent to any platform unless you choose.")).toBeVisible();
});

test("stop watching withdraws and takes her fingerprints with it", async ({ page }) => {
  await markTemplateReviewed("WATCH_AUTHORISATION");
  await signInForWatch(page);
  await page.locator("input[type=file]").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: await syntheticPng(page) });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#crawl-tick").check();
  await page.waitForURL(/\/case\//, { timeout: 30_000 });

  // Stop watching, with the existing withdrawal confirmation.
  await page.locator("#crawl-tick").uncheck();
  await expect(page.getByText("Stop watching?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, stop watching" }).click();
  await expect(page.getByText("Watching was stopped and your fingerprints were deleted.")).toBeVisible();
});
