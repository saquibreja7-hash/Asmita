// The detector panel journey (docs/lab/beta-spec.md WP90): a visitor uploads
// one synthetic image and sees every "AI-made or manipulated" detector's
// verdict side by side. Playwright's server env pins every provider key
// empty, so the panel's honest answer here is a "not configured" row per
// detector, and no image ever leaves the machine. The uploaded PNG is a
// plain gradient generated in the test — synthetic data only.

import { expect, test } from "@playwright/test";

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

test.describe("AI Lab detector panel, WP90", () => {
  test.beforeEach(async ({ page }) => {
    // Pin the motion environment like tests/e2e/hash-flow.spec.ts does.
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("shows the Beta badge, the under-18 pointer, and honest not-configured rows", async ({ page }) => {
    await page.goto("/lab/detectors");

    await expect(page.getByRole("heading", { name: "Detector panel" })).toBeVisible();
    await expect(page.getByText("Beta: experimental")).toBeVisible();
    await expect(page.getByText("This tool cannot prove where an image came from.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Under 18\? Find the right help/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the AI Lab" })).toHaveAttribute("href", "/lab");

    // The run button waits for both an image and the consent tick.
    const run = page.getByRole("button", { name: "Run the check" });
    await expect(run).toBeDisabled();
    await page.locator('input[type="file"]').setInputFiles({
      name: "gradient.png",
      mimeType: "image/png",
      buffer: await gradientPng(page),
    });
    await expect(run).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(run).toBeEnabled();

    await run.click();

    // The result is announced to assistive tech and rendered as one row per
    // detector, each honestly "not configured" in this keyless environment.
    // 30 s headroom for the dev server's first-compile of the routes on this
    // shared machine (the panel's own per-detector budget is 45 s; the
    // second, warm test needs none of it).
    await expect(page.locator("main").getByRole("status")).toContainText("What the detectors say", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "What the detectors say" })).toBeVisible();
    await expect(page.getByText("OpenAI vision")).toBeVisible();
    await expect(page.getByText("Hive AI-generated detection")).toBeVisible();
    await expect(page.getByText("Sightengine ai-generated")).toBeVisible();
    // WP113: the Lab's own GenD row is present, labelled and credited, and
    // honestly "not configured" while LAB_GEND_URL is unset.
    await expect(page.getByText("GenD (open model, CTU Prague)")).toBeVisible();
    await expect(page.getByText("Checks face swaps and face reenactment, not every AI-made image.")).toBeVisible();
    // The paper and code links appear twice on purpose — in the row's note
    // and in the credits disclosure below — and both must point at the
    // sources.
    const paperLinks = page.getByRole("link", { name: "Paper" });
    await expect(paperLinks).toHaveCount(2);
    for (const link of [paperLinks.nth(0), paperLinks.nth(1)]) {
      await expect(link).toHaveAttribute("href", "https://arxiv.org/abs/2508.06248");
    }
    const codeLinks = page.getByRole("link", { name: "Code" });
    await expect(codeLinks).toHaveCount(2);
    for (const link of [codeLinks.nth(0), codeLinks.nth(1)]) {
      await expect(link).toHaveAttribute("href", "https://github.com/yermandy/GenD");
    }
    await expect(page.getByText("Not configured on this site")).toHaveCount(4);
    // With no scored detector there is nothing to disagree about.
    await expect(page.getByText("The detectors disagree.")).toHaveCount(0);
    // The page's sources disclosure (WP113): GenD and YuNet, named and
    // linked, visible without running a check.
    await expect(page.getByRole("heading", { name: "Sources and credits" })).toBeVisible();
    await expect(page.getByText(/GenD: Deepfake Detection that Generalizes Across Benchmarks/)).toBeVisible();
    await expect(page.getByText(/YuNet: the face detector that finds and aligns the face/)).toBeVisible();
  });

  test("renders fully in Hindi, Beta badge included", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/lab/detectors");
    await expect(page.getByRole("heading", { name: "डिटेक्टर पैनल" })).toBeVisible();
    await expect(page.getByText("बीटा: प्रायोगिक")).toBeVisible();
    await expect(page.getByRole("button", { name: "जाँच चलाएँ" })).toBeVisible();
    await expect(page.getByRole("link", { name: /18 वर्ष से कम उम्र के हैं\? सही मदद खोजें/ })).toBeVisible();
    // WP113: the credits heading renders in Hindi too (machine translated,
    // pending native review).
    await expect(page.getByRole("heading", { name: "स्रोत और श्रेय" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "gradient.png",
      mimeType: "image/png",
      buffer: await gradientPng(page),
    });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "जाँच चलाएँ" }).click();
    await expect(page.getByText("इस साइट पर कॉन्फ़िगर नहीं है")).toHaveCount(4);
    // The GenD row is there, labelled as on the English page.
    await expect(page.getByText("GenD (open model, CTU Prague)")).toBeVisible();
    await context.close();
  });
});
