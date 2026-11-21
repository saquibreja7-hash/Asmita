// The photo protection journey (docs/lab/beta-spec.md WP91): a visitor
// uploads a photo, the page adds the invisible protective layer entirely in
// the browser, shows the before/after pair side by side and offers the
// protected PNG for download. Nothing is uploaded anywhere in this flow —
// there is no server half — so the whole journey runs offline against the
// dev server. The uploaded PNG is a plain gradient generated in the test:
// synthetic data only.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** A plain 320x240 teal-to-parchment gradient PNG, drawn in the page. */
async function gradientPng(page: import("@playwright/test").Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 320, 240);
    gradient.addColorStop(0, "#0a5e5a");
    gradient.addColorStop(1, "#f6f3f1");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 240);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

test.describe("AI Lab photo protection, WP91", () => {
  test.beforeEach(async ({ page }) => {
    // Pin the motion environment like tests/e2e/hash-flow.spec.ts does.
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("adds the layer in the browser and offers the download", async ({ page }) => {
    await page.goto("/lab/protect");

    await expect(page.getByRole("heading", { name: "Photo protection" })).toBeVisible();
    await expect(page.getByText("Beta: experimental")).toBeVisible();
    await expect(
      page.getByText("This tool cannot promise that a morph of your photo will fail."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Under 18\? Find the right help/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the AI Lab" })).toHaveAttribute("href", "/lab");

    // The protect button waits for a photo; no consent tick exists because
    // nothing ever leaves the visitor's device.
    const protect = page.getByRole("button", { name: "Add the protection" });
    await expect(protect).toBeDisabled();
    // The privacy line appears both in the uploader and in the explainer.
    await expect(page.getByText("Your photo never leaves your device.").first()).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "gradient.png",
      mimeType: "image/png",
      buffer: await gradientPng(page),
    });
    await expect(protect).toBeEnabled();
    await protect.click();

    // The result is announced to assistive tech, and the before/after pair
    // renders side by side with the strong limits notice.
    await expect(page.locator("main").getByRole("status")).toContainText("Your protected photo");
    await expect(page.getByRole("heading", { name: "Your protected photo" })).toBeVisible();
    await expect(page.locator("figcaption", { hasText: "Original photo" })).toBeVisible();
    await expect(page.locator("figcaption", { hasText: "Protected photo" })).toBeVisible();
    await expect(
      page.getByText("This protection is experimental. It may not stop every tool"),
    ).toBeVisible();

    const images = page.locator("figure img");
    await expect(images).toHaveCount(2);

    // The download button appears and really delivers the protected PNG.
    const download = page.getByRole("link", { name: "Download the protected photo" });
    await expect(download).toBeVisible();
    const [saved] = await Promise.all([
      page.waitForEvent("download"),
      download.click(),
    ]);
    expect(saved.suggestedFilename()).toBe("protected-photo.png");
    const path = await saved.path();
    expect(path).toBeTruthy();
    const bytes = readFileSync(path!);
    expect(bytes.length).toBeGreaterThan(100);
    // PNG magic bytes: the download is a real PNG, not an error page.
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  test("renders fully in Hindi, Beta badge included", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/lab/protect");
    await expect(page.getByRole("heading", { name: "फ़ोटो सुरक्षा" })).toBeVisible();
    await expect(page.getByText("बीटा: प्रायोगिक")).toBeVisible();
    await expect(page.getByRole("link", { name: /18 वर्ष से कम उम्र के हैं\? सही मदद खोजें/ })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "gradient.png",
      mimeType: "image/png",
      buffer: await gradientPng(page),
    });
    await page.getByRole("button", { name: "सुरक्षा जोड़ें" }).click();
    await expect(page.getByRole("heading", { name: "आपकी सुरक्षित फ़ोटो" })).toBeVisible();
    await expect(page.getByRole("link", { name: "सुरक्षित फ़ोटो डाउनलोड करें" })).toBeVisible();
    await context.close();
  });
});
