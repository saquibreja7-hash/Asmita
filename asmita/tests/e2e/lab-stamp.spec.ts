// NOT YET RUN. Written on a Windows machine with no Playwright and no
// Postgres, so this spec has never executed. It follows the conventions of
// lab-message-check.spec.ts and lab.spec.ts; playwright.config.ts sets
// ENABLE_LAB=true for the shared dev server and defines no LAB_C2PA_* env,
// so every check below runs against the honest "signing is not configured"
// page the tool shows without a key — the full stamping journey is covered
// by tests/unit/lab-stamp.test.ts with the real engine and a throwaway key.
// Run it before relying on it, through e2e-some.sh:
//   npx playwright test tests/e2e/lab-stamp.spec.ts --project=chromium
//
// WP94 (docs/lab/beta-spec.md): the Content Credentials stamp journey.

import { expect, test } from "@playwright/test";

test.describe("stamp (/lab/stamp)", () => {
  test("the page is honest about what the stamp cannot do, and about who it is for", async ({ page }) => {
    await page.goto("/lab/stamp");

    // The beta label and its plain limits sentence are visible, and the
    // under-18 pointer carries the site's /minor-support pattern.
    await expect(page.getByText("Beta · Experimental")).toBeVisible();
    await expect(page.getByText(/cannot stop anyone editing or copying your photo/i)).toBeVisible();
    const under18 = page.getByRole("link", { name: "Go to the under-18 support page" });
    await expect(under18).toHaveAttribute("href", "/minor-support");

    // The about section states both halves of the truth: what the stamp is,
    // and that it is evidence, not protection.
    await expect(page.getByRole("heading", { name: "About the stamp" })).toBeVisible();
    await expect(page.getByText(/It is evidence, not protection/i)).toBeVisible();
    await expect(page.getByText(/untrusted signer/i)).toBeVisible();

    // Back to the Lab.
    await expect(page.getByRole("link", { name: "Back to the AI Lab" })).toHaveAttribute("href", "/lab");
  });

  test("without a signing key the page explains that signing is not configured and offers nothing", async ({ page }) => {
    await page.goto("/lab/stamp");

    await expect(page.getByText("Signing is not set up yet")).toBeVisible();
    await expect(
      page.getByText(/needs a signing certificate from the site's owner before it can stamp photos/i),
    ).toBeVisible();

    // Nothing is offered: no file input, no submit button.
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stamp the photo" })).toHaveCount(0);
  });

  test("the page works in Hindi too", async ({ page }) => {
    await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    await page.goto("/lab/stamp");
    await expect(page.getByRole("heading", { name: "अपनी तस्वीर पर कंटेंट क्रेडेंशियल की छाप लगाएँ" })).toBeVisible();
    await expect(page.getByText("साइनिंग अभी तैयार नहीं है")).toBeVisible();
    await expect(page.getByRole("heading", { name: "छाप के बारे में" })).toBeVisible();
  });

  test("the route keeps its hygiene at the API level", async ({ request }) => {
    // No CSRF pair: refused.
    expect((await request.post("/api/lab/stamp", { multipart: { image: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) } } })).status()).toBe(403);

    const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
    const send = (data: Record<string, unknown>) =>
      request.post("/api/lab/stamp", { headers: { "x-csrf-token": token }, multipart: data as never });

    // A synthetic JPEG and no signing key in the dev server: the honest
    // signing_not_configured refusal, matching the page.
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      Buffer.alloc(64, 0x11),
      Buffer.from([0xff, 0xd9]),
    ]);
    const response = await send({ image: { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpeg } });
    expect(response.status()).toBe(503);
    expect((await response.json() as Record<string, unknown>).error).toBe("signing_not_configured");

    // An unknown part, and a non-image file: refused before anything runs.
    expect(
      (
        await send({
          image: { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpeg },
          sneaky: "1",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await send({
          image: { name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a photo at all") },
        })
      ).status(),
    ).toBe(400);
  });
});
