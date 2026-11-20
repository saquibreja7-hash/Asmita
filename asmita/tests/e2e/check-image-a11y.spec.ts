/*
 * WP43: accessibility of the "Is this image AI-made?" page.
 *
 * The on-device result is announced to screen readers (A5): when the reading
 * finishes, focus moves to the result heading ("What we found", a real h2
 * with tabIndex=-1). The hidden file input is never a tab stop and always
 * carries an accessible name, so the visible button is the only tab stop (A6).
 * The checking state is a role=status paragraph and every error message is a
 * role=alert; those conditional states are pinned by
 * tests/unit/check-image-a11y.test.ts because they are too brief or (for the
 * error card) unreachable from a real file pick, and the page never sends the
 * file anywhere for these checks.
 */
import { expect, test } from "@playwright/test";

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

test("the image check announces its result by moving focus to the result heading", async ({ page }) => {
  // The first pick also compiles the on-device reader chunks in dev mode.
  test.setTimeout(120_000);
  await page.goto("/check-image");

  // A6: the hidden input is not a tab stop and carries an accessible name;
  // the visible button is the control she reaches with the keyboard.
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveCount(1);
  await expect(fileInput).toHaveAttribute("tabindex", "-1");
  await expect(fileInput).toHaveAttribute("aria-label", "Choose an image to check");

  await page.getByRole("checkbox", { name: "The person in this image is 18 or older." }).check();

  const resultHeading = page.getByRole("heading", { name: "What we found" });
  await fileInput.setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: await syntheticPng(page) });

  // A5: the result card is announced — focus lands on its heading.
  await expect(resultHeading).toBeVisible();
  await expect(resultHeading).toBeFocused();

  // Every later check announces too: move focus off the heading, pick another
  // image, and the heading receives focus again.
  await page.getByRole("button", { name: "Choose a different image" }).focus();
  await expect(resultHeading).not.toBeFocused();
  await fileInput.setInputFiles({ name: "second.png", mimeType: "image/png", buffer: await syntheticPng(page) });
  await expect(resultHeading).toBeFocused();
});
