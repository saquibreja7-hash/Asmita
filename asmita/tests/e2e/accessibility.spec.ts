import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Every page with the site chrome. The one-off flake on "/" was traced to
// motion and late font swaps, so every scan runs with reduced motion emulated
// (the stylesheet also turns all transitions off under reduce) and waits for
// the fonts before analyzing.
const routes = [
  "/",
  "/register",
  "/minor-support",
  "/resources",
  "/faq",
  "/privacy",
  "/for-platforms",
  "/eligibility",
  "/track",
  "/check-image",
  "/start",
  "/get-help",
];

for (const route of routes) {
  test(`has no critical accessibility violations on ${route}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const actionable = results.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .flatMap((violation) => violation.nodes.map((node) => ({
        rule: violation.id,
        target: node.target.join(" "),
        summary: node.failureSummary?.split("\n")[1] ?? "",
      })));
    expect(actionable).toEqual([]);
  });
}

test("the skip link is the first Tab stop and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.locator("a.skip-link");
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await expect(skip).toHaveText("Skip to main content");

  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

// The language toggle lives in the footer; its two buttons must be thumb-sized.
test("language toggle buttons are at least 44px tall", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await page.goto("/");
  const buttons = page.locator(".seg button");
  await expect(buttons).toHaveCount(2);
  const heights = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
  expect(heights).toHaveLength(2);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

// A20: every step change — forward or back — lands focus on the question
// heading so screen readers announce the new question.
test("eligibility wizard focuses the question heading on every step change", async ({ page }) => {
  await page.goto("/eligibility");
  const heading = page.locator("h2");
  await expect(heading).toHaveText("How old are you now?");

  await page.getByRole("button", { name: "18 or over" }).click();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("How old were you when the photo or video was made?");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("How old are you now?");
});
