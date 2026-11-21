import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/register", "/minor-support", "/resources", "/faq", "/privacy", "/for-platforms"];

for (const route of routes) {
  test(`has no critical accessibility violations on ${route}`, async ({ page }) => {
    await page.goto(route);
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

test("the footer language control persists the selected language across viewport changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const english = page.getByRole("button", { name: "EN", exact: true });
  const hindi = page.getByRole("button", { name: "हिंदी", exact: true });
  const root = page.locator("html");

  await hindi.click();
  await expect(root).toHaveAttribute("lang", "hi");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(hindi).toHaveAttribute("aria-pressed", "true");

  await english.click();
  await expect(root).toHaveAttribute("lang", "en");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(english).toHaveAttribute("aria-pressed", "true");
});
