// The free stacks journey (docs/lab/open-tools-spec.md, WP153): the
// /lab/stacks index renders one card per stack with the two later stacks
// "Coming next" without a link, the stop-reuploads stack renders the full
// Part C3 template (breadcrumb, fact boxes, the pipeline diagram, numbered
// steps, plan, gaps, India notes, Work with Asmita, the closing band), the
// tool pages' closing band reaches the stack that uses the tool, an unbuilt
// stack slug answers 404, and the Hindi locale carries the translated
// chrome with the English-only notice. The Lab-off 404 is covered by
// tests/unit/lab-stack-pages.test.ts: the shared e2e server pins
// ENABLE_LAB=true, so no run here can see the Lab off.

import { expect, test } from "@playwright/test";
import { getStack, STACKS } from "@/lib/lab/open-tools/stacks";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";

const stack = getStack("stop-reuploads")!;

/** The tools this stack uses, in first-appearance order, deduplicated. */
const stackSlugs: string[] = [];
for (const step of stack.steps) {
  for (const slug of step.tools) {
    if (!stackSlugs.includes(slug)) stackSlugs.push(slug);
  }
}

test.describe("AI Lab free stacks, WP153", () => {
  test("renders the index with one card per stack, the later two Coming next", async ({ page }) => {
    // The dev server compiles a route on first request, and a cold compile
    // can outlast any single wait in the e2e container: warm the route
    // first (the WP152 pattern), then assert.
    test.setTimeout(150_000);
    await page.goto("/lab/stacks", { timeout: 120_000 });

    await expect(page.getByRole("heading", { name: "Free stacks", exact: true })).toBeVisible();
    await expect(page.getByText("Ready-made combinations of open tools for a specific job")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Three stacks for three kinds of organisation" }),
    ).toBeVisible();

    // One card per stack, in the data's order, each naming its tools.
    const cards = page.locator("article.ot-stacks-card");
    await expect(cards).toHaveCount(STACKS.length);
    for (const other of STACKS) {
      await expect(cards.filter({ hasText: other.title })).toBeVisible();
      for (const slug of new Set(other.steps.flatMap((step) => step.tools))) {
        await expect(
          cards.filter({ hasText: other.title }).getByText(getOpenTool(slug)!.name, { exact: true }),
        ).toBeVisible();
      }
    }

    // The first card links its page through both the job title and the
    // Read-the-stack button; the later two say "Coming next" and carry no
    // route.
    await expect(page.locator('h3.ot-stacks-job a[href="/lab/stacks/stop-reuploads"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Read the stack" })).toHaveAttribute(
      "href",
      "/lab/stacks/stop-reuploads",
    );
    await expect(page.getByText("Coming next")).toHaveCount(2);
    await expect(page.locator('a[href="/lab/stacks/ai-app-guardrails"]')).toHaveCount(0);
    await expect(page.locator('a[href="/lab/stacks/rules-and-review"]')).toHaveCount(0);

    // The closing band links the directory.
    await expect(page.getByRole("heading", { name: "The tools behind these stacks" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse the open tools" })).toHaveAttribute(
      "href",
      "/lab/open-tools",
    );
  });

  test("opens the stop-reuploads stack and renders the full template", async ({ page }) => {
    test.setTimeout(150_000);
    // Warm the dynamic route first (cold-compile, the WP152 pattern).
    await page.goto("/lab/stacks/stop-reuploads", { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: stack.title, exact: true })).toBeVisible();

    // The real journey: index card button -> the stack page.
    await page.goto("/lab/stacks");
    await page.getByRole("link", { name: "Read the stack" }).click();
    await page.waitForURL("**/lab/stacks/stop-reuploads", { timeout: 60_000 });

    // Breadcrumb, header, For line, the three fact boxes.
    const crumb = page.locator("nav.ot-breadcrumb");
    await expect(crumb).toContainText("AI Lab");
    await expect(crumb).toContainText("Free stacks");
    await expect(crumb).toContainText(stack.title);
    await expect(page.getByText(`For: ${stack.forWho}`)).toBeVisible();
    const facts = page.locator(".ot-stack-fact");
    await expect(facts).toHaveCount(3);
    await expect(facts.nth(0)).toContainText("Time");
    await expect(facts.nth(0)).toContainText(stack.time);
    await expect(facts.nth(1)).toContainText("People");
    await expect(facts.nth(1)).toContainText(stack.people);
    await expect(facts.nth(2)).toContainText("Cost");
    await expect(facts.nth(2)).toContainText(stack.resources);

    // The pipeline: horizontal on desktop, the column hidden; both carry
    // one coral marker per step and the tool names as links.
    await expect(page.locator(".ot-pipeline-row")).toBeVisible();
    await expect(page.locator(".ot-pipeline-col")).toBeHidden();
    await expect(page.locator(".ot-pipeline-row .ot-dg-stepnum-bg")).toHaveCount(stack.steps.length);
    for (const slug of new Set(stack.steps.flatMap((step) => step.tools))) {
      // A tool can serve two steps (the Asmita feed serves steps 4 and 7),
      // so the same link can appear in more than one box; one visible
      // instance is the contract.
      await expect(page.locator(`.ot-pipeline-row a[href="/lab/open-tools/${slug}"]`).first()).toBeVisible();
    }

    // The numbered steps: every step h2, its lines and its mistakes.
    for (const [index, step] of stack.steps.entries()) {
      const section = page.locator(`section[aria-labelledby="ot-step-${index + 1}"]`);
      await expect(section.getByRole("heading", { name: step.name, exact: true })).toBeVisible();
      await expect(section).toContainText(step.what);
      await expect(section).toContainText(`What you need: ${step.need}`);
      await expect(section).toContainText(`Done when: ${step.doneWhen}`);
      for (const mistake of step.mistakes) {
        await expect(section).toContainText(mistake);
      }
      for (const slug of step.tools) {
        await expect(section.locator(`a[href="/lab/open-tools/${slug}"]`)).toBeVisible();
      }
    }

    // Plan, gaps, India notes, Work with Asmita.
    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
    for (const label of ["Week 1", "Weeks 2–3", "Month 2"]) {
      await expect(page.locator(".ot-stack-plan-title", { hasText: label })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "What this will not catch" })).toBeVisible();
    for (const gap of stack.wontCatch) {
      await expect(page.locator("section[aria-labelledby='ot-wont']")).toContainText(gap);
    }
    await expect(page.getByRole("heading", { name: "India notes" })).toBeVisible();
    await expect(page.locator(".ot-stack-notes")).toContainText(
      "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer.",
    );
    await expect(page.getByRole("heading", { name: "Work with Asmita" })).toBeVisible();
    // Scoped to this section: the site footer carries its own For platforms
    // link (the WP151 lesson about scoping to main, one level further).
    await expect(page.locator(".ot-stack-cta a[href='/for-platforms']")).toBeVisible();

    // The closing band: every tool in the stack, and the other stacks.
    await expect(page.getByRole("heading", { name: "All tools in this stack" })).toBeVisible();
    await expect(page.locator(".ot-stack-closecard")).toHaveCount(stackSlugs.length);
    for (const slug of stackSlugs) {
      await expect(page.locator(`.ot-stack-closecard a[href="/lab/open-tools/${slug}"]`)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "See the other stacks" })).toHaveAttribute("href", "/lab/stacks");
  });

  test("stacks the phone pipeline vertically", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lab/stacks/stop-reuploads", { timeout: 120_000 });

    await expect(page.getByRole("heading", { name: stack.title, exact: true })).toBeVisible();
    await expect(page.locator(".ot-pipeline-col")).toBeVisible();
    await expect(page.locator(".ot-pipeline-row")).toBeHidden();
    await expect(page.locator(".ot-pipeline-col .ot-dg-stepnum-bg")).toHaveCount(stack.steps.length);
    // The diagram scrolls inside its own box, not the page.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("reaches the stack from the directory and from a tool page's closing band", async ({ page }) => {
    test.setTimeout(150_000);
    // The directory's hero link.
    await page.goto("/lab/open-tools", { timeout: 120_000 });
    await expect(page.getByRole("link", { name: "See the free stacks" })).toHaveAttribute("href", "/lab/stacks");
    await page.getByRole("link", { name: "See the free stacks" }).click();
    await page.waitForURL("**/lab/stacks", { timeout: 60_000 });

    // PDQ's closing band links the stack that uses it; the journey lands
    // on the stack and back onto a tool page through a step's link.
    await page.goto("/lab/open-tools/pdq");
    await expect(page.getByRole("heading", { name: "See it in a stack" })).toBeVisible();
    await page.getByRole("link", { name: stack.title, exact: true }).click();
    await page.waitForURL("**/lab/stacks/stop-reuploads", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: stack.title, exact: true })).toBeVisible();
    await page.locator('section[aria-labelledby="ot-step-2"] a[href="/lab/open-tools/vpdq"]').click();
    await page.waitForURL("**/lab/open-tools/vpdq", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "vPDQ", exact: true })).toBeVisible();
  });

  test("answers 404 for an unknown stack slug and the two unbuilt stacks", async ({ page }) => {
    test.setTimeout(150_000);
    for (const slug of ["no-such-stack", "ai-app-guardrails", "rules-and-review"]) {
      const response = await page.goto(`/lab/stacks/${slug}`, { timeout: 120_000 });
      expect(response?.status()).toBe(404);
    }
  });

  test("renders the Hindi chrome on the index and the stack page", async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();

    // The index: hero, card text and chips in Hindi.
    await page.goto("/lab/stacks", { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "मुफ़्त स्टैक", exact: true })).toBeVisible();
    for (const other of STACKS) {
      await expect(page.getByText(other.hi.forWho)).toBeVisible();
      await expect(page.getByText(`${other.hi.time} · ${other.hi.people}`)).toBeVisible();
    }
    await expect(page.getByText("अगले चरण में")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "स्टैक पढ़ें" })).toHaveAttribute("href", "/lab/stacks/stop-reuploads");

    // The stack page: the English-only notice, translated chrome, and the
    // English body from the data.
    await page.goto("/lab/stacks/stop-reuploads");
    await expect(
      page.getByText("यह पृष्ठ अंग्रेज़ी में है क्योंकि यह तकनीकी टीमों के लिए लिखा गया है।"),
    ).toBeVisible();
    await expect(page.locator(".ot-stack-fact").nth(0)).toContainText("समय");
    await expect(page.getByRole("heading", { name: "योजना", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "जिन्हें यह स्टैक नहीं पकड़ेगा" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "भारत के संदर्भ में" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "अस्मिता के साथ काम" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "इस स्टैक के सभी टूल" })).toBeVisible();
    await expect(page.getByRole("heading", { name: stack.title, exact: true })).toBeVisible();
    await expect(page.getByText(stack.steps[0].what)).toBeVisible();

    await context.close();
  });
});
