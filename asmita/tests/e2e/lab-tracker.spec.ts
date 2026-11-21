// The service tracker journey (docs/lab/beta-spec.md WP92): the public page
// renders the E2 aggregate numbers from labPublicNumbers(). On the fresh e2e
// database no Lab row exists, so the page shows the honest empty state; the
// journey also proves the page never links a service (every anchor inside
// <main> stays on this site) and that the method is explained in plain words.
// This spec sorts before lab.spec.ts (which seeds Lab rows for its own
// journey), so the empty state is what the fresh database still shows. No
// network, no uploads, nothing invented beyond the page itself.

import { expect, test } from "@playwright/test";

test.describe("AI Lab service tracker, WP92", () => {
  test("renders the honest empty state and explains the method", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/tracker");

    await expect(page.getByRole("heading", { name: "Service tracker" })).toBeVisible();
    await expect(page.getByText("Beta: experimental")).toBeVisible();
    await expect(page.getByText("This page cannot name the services it watches")).toBeVisible();
    await expect(page.getByRole("link", { name: /Under 18\? Find the right help/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the AI Lab" })).toHaveAttribute("href", "/lab");

    // The honest empty state: announced, not hidden, and no invented zeroes.
    await expect(page.getByRole("status").getByText("No numbers yet")).toBeVisible();
    await expect(page.getByText("The Lab has not published any tracker numbers yet.")).toBeVisible();
    await expect(page.getByText("Aggregate numbers only. This page never names or links a service or provider")).toBeVisible();

    // The method, in plain words: what "taken down" means and how liveness
    // is checked.
    await expect(page.getByRole("heading", { name: "How we count" })).toBeVisible();
    await expect(page.getByText(/A service counts as taken down when every address/)).toBeVisible();
    await expect(page.getByText(/an automatic check sends one small request to each recorded address/)).toBeVisible();

    // No service is ever named or linked: every anchor in the page's content
    // stays inside this site.
    const hrefs = await page.locator("main a").evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/")).toBe(true);
    }
  });

  test("renders fully in Hindi at 320 px, Beta badge included", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/lab/tracker");
    await expect(page.getByRole("heading", { name: "सेवा ट्रैकर" })).toBeVisible();
    await expect(page.getByText("बीटा: प्रायोगिक")).toBeVisible();
    await expect(page.getByRole("link", { name: /18 वर्ष से कम उम्र के हैं\? सही मदद खोजें/ })).toBeVisible();
    await expect(page.getByRole("status").getByText("अभी कोई आँकड़े नहीं हैं")).toBeVisible();
    await expect(page.getByRole("heading", { name: "हम कैसे गिनते हैं" })).toBeVisible();
    await context.close();
  });
});
