import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/register", "/minor-support", "/resources", "/faq", "/privacy"];

for (const route of routes) {
  test(`has no critical accessibility violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
    expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([]);
  });
}
