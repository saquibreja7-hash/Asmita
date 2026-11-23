// NOT YET RUN. Written on a Windows machine with no Postgres and no Docker,
// so this spec has never executed; the full Playwright suite runs in a
// separate verify step. It follows the conventions of lab.spec.ts and
// hash-flow.spec.ts (canvas-drawn synthetic PNGs). Run it before relying on
// it: npx playwright test tests/e2e/lab-trace.spec.ts --project=chromium
//
// The trace tool (docs/lab/charter.md, experiment E3) runs entirely in the
// browser; playwright.config.ts sets ENABLE_LAB=true for the shared dev
// server. Two journeys: the same synthetic image as suspect and original
// must show the strong band, and two unrelated synthetic images must show
// the no-evidence band. The SSCD model URL is unset in the e2e environment,
// so the page honestly reports hashing-only scoring; the synthetic images
// contain no faces, so region scores are skipped — the verdicts come from the
// whole-image hash, the tile agreement and (for the identical pair) pixel
// equality. Nothing is ever uploaded; nothing is fetched but the page.

import { expect, test } from "@playwright/test";

// A textured synthetic photo stand-in: gradients plus shapes, rich enough
// that PDQ's quality score clears the tool's reliability floor (the unit
// tests pin the same property for the same kind of pattern).
async function syntheticPng(page: import("@playwright/test").Page, variant: number): Promise<Buffer> {
  const base64 = await page.evaluate((seed) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    for (let x = 0; x < 256; x += 4) {
      ctx.fillStyle = `hsl(${(seed * 47 + x) % 360}, 70%, ${30 + (x % 40)}%)`;
      ctx.fillRect(x, 0, 4, 256);
    }
    for (let y = 0; y < 256; y += 4) {
      ctx.fillStyle = `hsla(0, 0%, 100%, ${(y % 7) * 0.05})`;
      ctx.fillRect(0, y, 256, 4);
    }
    ctx.fillStyle = `hsl(${(seed * 130) % 360}, 90%, 45%)`;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(((seed * 37 + i * 61) % 256), ((seed * 53 + i * 43) % 256), 6 + (i % 5) * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "hsl(60, 100%, 50%)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      ctx.strokeRect(((seed + i * 29) % 200), ((seed * 3 + i * 17) % 200), 30, 40);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, variant);
  return Buffer.from(base64, "base64");
}

test.describe("AI Lab, E3 trace tool (/lab/trace)", () => {
  test("an identical pair shows the strong-evidence band, honestly explained", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Lab journeys run once");
    test.setTimeout(180_000);

    const png = await syntheticPng(page, 1);
    await page.goto("/lab/trace");
    await expect(page.getByRole("heading", { name: "Show a morph was made from her photo" })).toBeVisible();
    // The privacy promise is on the page before any file is chosen.
    await expect(page.getByText("Everything runs in this browser. Your images are never uploaded, never stored, and never sent anywhere.")).toBeVisible();

    await page.locator("#trace-suspect").setInputFiles({ name: "synthetic-suspect.png", mimeType: "image/png", buffer: png });
    await page.locator("#trace-originals").setInputFiles({ name: "synthetic-original.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Run the comparison" }).click();

    // The analysis (including the face-landmark model attempt, which fails
    // or finds nothing on these synthetic shapes) must land on the strong
    // band: the two images are pixel-identical.
    await expect(page.locator('[data-verdict="strong"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Strong evidence of a shared source")).toBeVisible();

    // The honest notes: hashing-only scoring (no model URL in e2e) and the
    // no-face note are both shown rather than hidden.
    await expect(page.getByText("Model-based comparison is off: no model address is configured, so the scores use image hashing (PDQ) only.")).toBeVisible();

    // And the evidence PDF offer is there with its standalone-document note.
    await expect(page.getByRole("button", { name: "Download the evidence PDF (in English)" })).toBeVisible();
    await expect(page.getByText("The PDF is written in English so any platform or officer can read it. It is a standalone research document. It is not part of filing a complaint.")).toBeVisible();
  });

  test("unrelated images show the no-evidence band", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Lab journeys run once");
    test.setTimeout(180_000);

    const suspect = await syntheticPng(page, 2);
    const unrelated = await syntheticPng(page, 3);
    await page.goto("/lab/trace");
    await page.locator("#trace-suspect").setInputFiles({ name: "synthetic-suspect.png", mimeType: "image/png", buffer: suspect });
    await page.locator("#trace-originals").setInputFiles({ name: "synthetic-unrelated.png", mimeType: "image/png", buffer: unrelated });
    await page.getByRole("button", { name: "Run the comparison" }).click();

    await expect(page.locator('[data-verdict="none"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("No evidence of a shared source")).toBeVisible();

    // The caveat about what the scores cannot prove stays on the page.
    await expect(page.getByText(/What these scores cannot prove/)).toBeVisible();
  });

  test("the tool is linked from the /lab page while the Lab is on", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Lab journeys run once");
    await page.goto("/lab");
    const cta = page.getByRole("link", { name: "Try the trace tool" });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/lab\/trace$/);
    await expect(page.getByRole("heading", { name: "Show a morph was made from her photo" })).toBeVisible();
  });
});
