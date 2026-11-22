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

// The language button lives in the footer and must be thumb-sized.
test("the footer language button is at least 44px tall", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await page.goto("/");
  const button = page.locator(".lang-button");
  await expect(button).toHaveCount(1);
  const height = await button.evaluate((node) => node.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
});

// A20: every step change — forward or back — lands focus on the question
// heading so screen readers announce the new question.
test("eligibility wizard focuses the question heading on every step change", async ({ page }) => {
  await page.goto("/eligibility");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("How old are you now?");

  await page.getByRole("button", { name: "18 or over" }).click();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("How old were you when the photo or video was made?");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("How old are you now?");
});

test("the footer language drawer switches language and keeps it across viewport changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const root = page.locator("html");
  const button = page.locator(".lang-button");
  const drawer = page.getByRole("dialog", { name: "Choose language" });

  await button.click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: /हिंदी/ }).click();
  await expect(drawer).toBeHidden();
  await expect(root).toHaveAttribute("lang", "hi");
  await expect(button).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(button).toContainText("हिंदी");

  await button.click();
  const drawerHi = page.getByRole("dialog", { name: "भाषा चुनें" });
  await expect(drawerHi).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawerHi).toBeHidden();
  await button.click();
  await drawerHi.getByRole("button", { name: /English/ }).click();
  await expect(root).toHaveAttribute("lang", "en");
});
