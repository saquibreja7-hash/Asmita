// The open tool page journey (docs/lab/open-tools-spec.md, WP152): a tool
// page opened from the directory renders the spec's section anatomy from
// the catalogue, the read-only workflow strip highlights the tool's stages,
// the copy button appears after hydration and copies, the page is fully
// readable without JavaScript (no dead controls), the Hindi locale shows the
// English-only notice with translated chrome and an English body, the
// closing band links the stacks that use the tool (or back to the
// directory), and an unknown slug answers 404. The Lab-off 404 is covered by
// tests/unit/lab-open-tool-pages.test.ts: the shared e2e server pins
// ENABLE_LAB=true, so no run here can see the Lab off.

import { expect, test } from "@playwright/test";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { stacksUsingTool } from "@/lib/lab/open-tools/stacks";

const pdq = OPEN_TOOLS.find((tool) => tool.slug === "pdq")!;

test.describe("AI Lab open tool pages, WP152", () => {
  test("opens a tool page from the directory with its sections", async ({ page }) => {
    // The dev server compiles a route on first request, and a cold compile
    // of this dynamic route can outlast any single wait in the e2e
    // container. Visit the tool page once first to warm the route, then
    // make the real journey: directory card link -> tool page.
    test.setTimeout(150_000);
    await page.goto("/lab/open-tools/pdq", { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "PDQ", exact: true })).toBeVisible();

    await page.goto("/lab/open-tools");
    // Wait for hydration to settle before clicking a card: the filter UI
    // mounts after hydration and shifts the cards, and a click dispatched
    // mid-shift lands on the wrong element (verified by a diagnostic probe:
    // an early mouse click never navigates, a settled one always does).
    await page.getByRole("button", { name: "All", exact: true }).waitFor();
    await page.locator('a[href="/lab/open-tools/pdq"]').click();
    await page.waitForURL("**/lab/open-tools/pdq", { timeout: 60_000 });

    // Breadcrumb, header, maintainer link and the chips row.
    await expect(page.getByRole("heading", { name: "PDQ", exact: true })).toBeVisible();
    await expect(page.locator("nav.ot-breadcrumb")).toContainText("AI Lab");
    await expect(page.locator("nav.ot-breadcrumb")).toContainText("Open tools");
    await expect(page.locator("nav.ot-breadcrumb")).toContainText("PDQ");
    await expect(
      page.getByRole("link", { name: "Meta (ThreatExchange) (opens the official site)" }),
    ).toHaveAttribute("href", "https://github.com/meta/ThreatExchange");
    await expect(page.locator(".ot-tool-chips").getByText("BSD-3-Clause")).toBeVisible();
    await expect(page.locator(".ot-tool-chips").getByText("Matching and hashing")).toBeVisible();

    // The aside facts.
    await expect(page.getByRole("heading", { name: "At a glance" })).toBeVisible();
    await expect(page.getByText("Perceptual image hash")).toBeVisible();
    await expect(page.getByText(/Last checked 22 November 2026/)).toBeVisible();

    // The spec's section order, as headings.
    const headings = page.locator(".ot-tool-main h2");
    await expect(headings).toHaveText([
      "What it does",
      "How it works",
      "Where it fits in a workflow",
      "What you get",
      "What it cannot do",
      "How to start",
      "How Asmita uses it",
      "Credit",
      "Related tools",
      "Sources",
    ]);

    // The credit card and the sources list.
    await expect(page.locator(".ot-credit")).toContainText("is made by Meta (ThreatExchange)");
    await expect(page.locator(".ot-credit")).toContainText("BSD-3-Clause");
    await expect(page.locator(".ot-credit")).toContainText("Asmita did not build it");
    for (const source of pdq.sources) {
      await expect(page.locator(".ot-sources")).toContainText(source);
    }

    // Related tools: vpdq, hma and stopncii, as cards linking to their pages.
    const related = page.locator(".ot-tool-main article.ot-card");
    await expect(related).toHaveCount(pdq.related.length);
    for (const slug of pdq.related) {
      await expect(page.locator(`.ot-tool-main a[href="/lab/open-tools/${slug}"]`)).toBeVisible();
    }
  });

  test("highlights this tool's stages in the read-only workflow strip", async ({ page }) => {
    await page.goto("/lab/open-tools/pdq");
    // PDQ covers Detect and Share: exactly those two stages light up, and
    // the strip is read-only here — no filter buttons.
    await expect(page.locator(".ot-strip .ot-stage-name.is-on")).toHaveCount(2);
    await expect(page.locator(".ot-strip").getByText("Detect", { exact: true })).toHaveClass(
      /is-on/,
    );
    await expect(page.locator(".ot-strip").getByText("Share", { exact: true })).toHaveClass(
      /is-on/,
    );
    await expect(page.locator(".ot-strip").getByText("Prevent", { exact: true })).not.toHaveClass(
      /is-on/,
    );
    await expect(page.locator("main button")).toHaveCount(0);
  });

  test("draws the diagram for the tool's kind", async ({ page }) => {
    await page.goto("/lab/open-tools/pdq");
    await expect(page.locator(".ot-diagram svg")).toHaveCount(1);
    await expect(page.locator(".ot-diagram svg")).toHaveAttribute("aria-hidden", "true");

    // The two ROOST directories render no diagram.
    await page.goto("/lab/open-tools/awesome-safety-tools");
    await expect(page.locator(".ot-diagram svg")).toHaveCount(0);
  });

  test("copies the code snippet after hydration", async ({ browser }) => {
    const context = await browser.newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    await page.goto("/lab/open-tools/ncii-prompt-guard");

    const block = page.locator(".ot-code");
    await expect(block.locator("code")).toContainText("hfmlsoc/ncii-prompt-guard-3c");
    const copy = page.getByRole("button", { name: "Copy", exact: true });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();

    await context.close();
  });

  test("keeps every section readable without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/open-tools/coop");

    await expect(page.getByRole("heading", { name: "Coop", exact: true })).toBeVisible();
    for (const heading of [
      "What it does",
      "How it works",
      "What you get",
      "What it cannot do",
      "How to start",
      "Credit",
      "Sources",
    ]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    // The code-free page renders no dead controls at all.
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);

    await context.close();
  });

  test("shows the Hindi chrome, the English-only notice and the English body", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();
    await page.goto("/lab/open-tools/pdq");

    await expect(
      page.getByText("यह पृष्ठ अंग्रेज़ी में है क्योंकि यह तकनीकी टीमों के लिए लिखा गया है।"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "एक नज़र में" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "यह क्या करता है", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "श्रेय" })).toBeVisible();
    // The body stays English, straight from the catalogue.
    await expect(page.getByText(pdq.whatItDoes[0])).toBeVisible();
    await expect(page.getByText(/अंतिम जाँच/)).toBeVisible();

    await context.close();
  });

  test("links the closing band to the stacks that use the tool", async ({ page }) => {
    await page.goto("/lab/open-tools/pdq");
    const stacks = stacksUsingTool("pdq");
    expect(stacks.length).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "See it in a stack" })).toBeVisible();
    for (const stack of stacks) {
      await expect(page.locator(`a[href="/lab/stacks/${stack.slug}"]`)).toBeVisible();
    }

    // A tool no stack uses links back to the directory instead.
    await page.goto("/lab/open-tools/tmk-pdqf");
    await expect(
      page.getByText("This tool is not part of one of our stack guides yet."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to all tools" })).toHaveAttribute(
      "href",
      "/lab/open-tools",
    );
    await expect(page.locator('a[href^="/lab/stacks/"]')).toHaveCount(0);
  });

  test("answers 404 for an unknown slug", async ({ page }) => {
    const response = await page.goto("/lab/open-tools/not-a-real-tool");
    expect(response?.status()).toBe(404);
  });
});
