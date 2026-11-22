// The open tools directory journey (docs/lab/open-tools-spec.md, WP151): the
// /lab/open-tools page renders every catalogue card server-side, the filter
// controls appear after hydration and actually filter (stage AND audience AND
// search, with a live count), the page works with JavaScript disabled, the
// Lab hub carries the two new section cards above the beta tools, and the
// Hindi chrome is complete. The Lab-off 404 is covered in
// tests/unit/lab-open-tools-directory.test.ts: the shared dev server pins
// ENABLE_LAB=true, so no e2e server here can answer with the Lab off.

import { expect, test } from "@playwright/test";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { filterTools } from "@/lib/lab/open-tools/filters";

const TOOL_LINK = (slug: string) => `a[href="/lab/open-tools/${slug}"]`;
const CARDS = "article.ot-card";

async function expectCount(page: import("@playwright/test").Page, count: number) {
  await expect(page.locator(CARDS)).toHaveCount(count);
  const line = count === 1 ? "1 tool shown" : `${count} tools shown`;
  await expect(page.locator(".ot-count")).toContainText(line);
}

test.describe("AI Lab open tools directory, WP151", () => {
  test("renders the hero, the seven groups and every catalogue card", async ({ page }) => {
    await page.goto("/lab/open-tools");

    await expect(page.getByRole("heading", { name: "Open tools for trust and safety" })).toBeVisible();
    await expect(page.getByRole("link", { name: "See the free stacks" })).toHaveAttribute("href", "/lab/stacks");
    await expect(page.getByRole("link", { name: "How we choose tools" })).toHaveAttribute(
      "href",
      "/lab/open-tools/how-we-choose",
    );

    // The filters arrive with hydration; before that the cards are already
    // in the markup.
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
    for (const stage of ["Prevent", "Detect", "Review", "Act", "Share"]) {
      await expect(page.getByRole("button", { name: stage, exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("Search tools")).toBeVisible();

    // The category groups appear in the spec's fixed order.
    const headings = page.locator("section.ot-group h2");
    await expect(headings).toHaveText([
      "Matching and hashing",
      "Review and rules",
      "Detection models",
      "Provenance",
      "Free services (not open source)",
      "From Asmita",
      "Directories",
    ]);

    // Every catalogue tool is a card whose title links to its page.
    await expectCount(page, OPEN_TOOLS.length);
    for (const tool of OPEN_TOOLS) {
      await expect(page.locator(TOOL_LINK(tool.slug))).toBeVisible();
    }

    // The closing band and the quiet footer lines.
    await expect(page.getByRole("heading", { name: "Know a tool we should add?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Suggest a tool" })).toHaveAttribute("href", "/feedback");
    await expect(
      page.getByText("Tool names belong to their owners. Asmita is not affiliated with these projects unless marked From Asmita."),
    ).toBeVisible();
    // Scoped to main: the site footer carries its own Get help link.
    await expect(page.locator("main").getByRole("link", { name: "Get help" })).toHaveAttribute(
      "href",
      "/get-help",
    );
  });

  test("filters by stage, audience and search, with the live count", async ({ page }) => {
    await page.goto("/lab/open-tools");
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();

    // Stage filter: only the tools that cover Detect.
    const detect = filterTools(OPEN_TOOLS, { stage: "detect" });
    await page.getByRole("button", { name: "Detect", exact: true }).click();
    await expectCount(page, detect.length);
    await expect(page.getByRole("button", { name: "Detect", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(TOOL_LINK("coop"))).toBeHidden();
    await expect(page.locator(TOOL_LINK("pdq"))).toBeVisible();

    // Audience ANDs with the stage.
    const both = filterTools(OPEN_TOOLS, { stage: "detect", audience: "ai-app" });
    await page.getByRole("button", { name: "an AI app" }).click();
    await expectCount(page, both.length);
    await expect(page.getByRole("button", { name: "an AI app" })).toHaveAttribute("aria-pressed", "true");

    // Clicking the active stage chip clears it; the audience stays.
    await page.getByRole("button", { name: "an AI app" }).click();
    await expectCount(page, detect.length);

    // "All" resets the stage filter.
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expectCount(page, OPEN_TOOLS.length);

    // Search alone.
    const pdq = filterTools(OPEN_TOOLS, { query: "PDQ" });
    await page.getByLabel("Search tools").fill("PDQ");
    await expectCount(page, pdq.length);

    // Nothing matches: the empty state with its clear button.
    await page.getByLabel("Search tools").fill("nothing matches this");
    await expect(page.locator(CARDS)).toHaveCount(0);
    await expect(page.getByText("No tool matches those filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expectCount(page, OPEN_TOOLS.length);
    await expect(page.getByLabel("Search tools")).toHaveValue("");
  });

  test("keeps every card reachable without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/open-tools");

    await expect(page.getByRole("heading", { name: "Open tools for trust and safety" })).toBeVisible();
    await expect(page.locator(CARDS)).toHaveCount(OPEN_TOOLS.length);
    for (const tool of OPEN_TOOLS.slice(0, 5)) {
      await expect(page.locator(TOOL_LINK(tool.slug))).toBeVisible();
    }

    // The filter UI never renders in the main content: no buttons, no search
    // box. (The site header keeps its own menu buttons.)
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);

    await context.close();
  });

  test("shows the two section cards above the beta tools on the Lab hub", async ({ page }) => {
    await page.goto("/lab");
    await expect(page.getByRole("heading", { name: "Try the beta tools" })).toBeVisible();

    const openTools = page.getByRole("link", { name: "Open tools", exact: true });
    await expect(openTools).toHaveAttribute("href", "/lab/open-tools");
    await expect(page.getByRole("link", { name: "Free stacks", exact: true })).toHaveAttribute(
      "href",
      "/lab/stacks",
    );

    // The section cards lead the grid, ahead of the first beta tool.
    const gridLinks = page.locator("section[aria-labelledby='lab-tools'] h3 a");
    const names = await gridLinks.allInnerTexts();
    expect(names.indexOf("Open tools")).toBeLessThan(names.indexOf("Trace a morph"));
    expect(names.indexOf("Free stacks")).toBeLessThan(names.indexOf("Trace a morph"));

    // The beta cards are untouched: seven Beta badges, none on the new cards.
    await expect(page.getByText("Beta: experimental")).toHaveCount(7);
  });

  test("renders the Hindi chrome, filters included", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();
    await page.goto("/lab/open-tools");

    await expect(page.getByRole("heading", { name: "ट्रस्ट ऐंड सेफ़्टी के लिए ओपन टूल" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "मैचिंग और हैशिंग" })).toBeVisible();
    await expect(page.getByRole("button", { name: "सभी", exact: true })).toBeVisible();
    await expect(page.getByLabel("टूल खोजें")).toBeVisible();

    // The cards carry the catalogue's Hindi summaries.
    const pdq = OPEN_TOOLS.find((tool) => tool.slug === "pdq")!;
    await expect(page.getByText(pdq.summary.hi)).toBeVisible();

    // Filtering works in Hindi too, with the Hindi live count.
    await page.getByRole("button", { name: "रोकथाम", exact: true }).click();
    const prevent = filterTools(OPEN_TOOLS, { stage: "prevent" });
    await expect(page.locator(CARDS)).toHaveCount(prevent.length);
    await expect(page.locator(".ot-count")).toContainText(`${prevent.length} टूल दिख रहे हैं`);

    // The closing band and footer lines are translated.
    await expect(page.getByRole("link", { name: "टूल सुझाएँ" })).toHaveAttribute("href", "/feedback");
    // Scoped to main: the site footer carries its own मदद लें link.
    await expect(page.locator("main").getByRole("link", { name: "मदद लें" })).toHaveAttribute(
      "href",
      "/get-help",
    );

    await context.close();
  });

  test("keeps the strip compact on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lab/open-tools");

    // The stage buttons stay in a horizontal row; the meanings are hidden on
    // phones (the cards below already carry the stage names).
    await expect(page.getByRole("button", { name: "Prevent", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();
    // All five meanings stay in the markup; the media query hides them.
    await expect(page.locator(".ot-stage-meaning")).toHaveCount(5);
    await expect(page.locator(".ot-stage-meaning").first()).toBeHidden();

    // The strip scrolls rather than wrapping or overflowing the page.
    const scrollable = await page.locator(".ot-strip").evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    expect(scrollable).toBe(true);
    await expect(page.locator(CARDS).first()).toBeVisible();
  });
});
