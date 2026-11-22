// The free stacks journey (docs/lab/open-tools-spec.md, WP153, completed by
// WP154): the /lab/stacks index renders one card per stack and — since
// WP154 — every card links its stack's page (the WP153 "Coming next" state
// is gone). Each of the three stacks renders the full Part C3 template
// (breadcrumb, fact boxes, the pipeline diagram, numbered steps, plan,
// gaps, India notes, Work with Asmita, the closing band), the tool pages'
// closing bands reach the stacks that use them, an unknown stack slug
// answers 404, and the Hindi locale carries the translated chrome with the
// English-only notice. The Lab-off 404 is covered by
// tests/unit/lab-stack-pages.test.ts: the shared e2e server pins
// ENABLE_LAB=true, so no run here can see the Lab off.

import { expect, test } from "@playwright/test";
import { getStack, STACKS } from "@/lib/lab/open-tools/stacks";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";

/** The tools one stack uses, in first-appearance order, deduplicated. */
function stackSlugs(slug: string): string[] {
  const stack = getStack(slug)!;
  const slugs: string[] = [];
  for (const step of stack.steps) {
    for (const tool of step.tools) {
      if (!slugs.includes(tool)) slugs.push(tool);
    }
  }
  return slugs;
}

/** The closing link of the Work with Asmita section, per stack. */
function withAsmitaHref(slug: string): string {
  return slug === "ai-app-guardrails" ? "/feedback" : "/for-platforms";
}

test.describe("AI Lab free stacks, WP153/WP154", () => {
  test("renders the index with one card per stack, every card linking its page", async ({ page }) => {
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
    for (const stack of STACKS) {
      await expect(cards.filter({ hasText: stack.title })).toBeVisible();
      for (const slug of new Set(stack.steps.flatMap((step) => step.tools))) {
        await expect(
          cards.filter({ hasText: stack.title }).getByText(getOpenTool(slug)!.name, { exact: true }),
        ).toBeVisible();
      }
      // WP154: every card links its page through both the job title and
      // the Read-the-stack button; nothing says "Coming next".
      await expect(page.locator(`h3.ot-stacks-job a[href="/lab/stacks/${stack.slug}"]`)).toBeVisible();
      await expect(page.locator(`a.btn-secondary[href="/lab/stacks/${stack.slug}"]`)).toBeVisible();
    }
    await expect(page.getByText("Coming next")).toHaveCount(0);

    // The closing band links the directory.
    await expect(page.getByRole("heading", { name: "The tools behind these stacks" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse the open tools" })).toHaveAttribute(
      "href",
      "/lab/open-tools",
    );
  });

  for (const stack of STACKS) {
    const slugs = stackSlugs(stack.slug);
    // The first step that names tools; its first tool link is clicked at
    // the end of the test to prove the step links navigate.
    const linkedStep = stack.steps.findIndex((step) => step.tools.length > 0);
    const linkedStepNumber = linkedStep + 1;
    const firstToolSlug = stack.steps[linkedStep].tools[0];
    const firstTool = getOpenTool(firstToolSlug)!;

    test(`opens the ${stack.slug} stack and renders the full template`, async ({ page }) => {
      test.setTimeout(150_000);
      // Warm the dynamic route first (cold-compile, the WP152 pattern).
      await page.goto(`/lab/stacks/${stack.slug}`, { timeout: 120_000 });
      await expect(page.getByRole("heading", { name: stack.title, exact: true })).toBeVisible();

      // The real journey: index card button -> the stack page.
      await page.goto("/lab/stacks");
      await page.locator(`a.btn-secondary[href="/lab/stacks/${stack.slug}"]`).click();
      await page.waitForURL(`**/lab/stacks/${stack.slug}`, { timeout: 60_000 });

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
        // A tool can serve two steps (the Asmita feed serves two steps of
        // the re-uploads stack), so the same link can appear in more than
        // one box; one visible instance is the contract.
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
          await expect(section.locator(`a[href="/lab/open-tools/${slug}"]`).first()).toBeVisible();
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
      await expect(page.locator(`.ot-stack-cta a[href='${withAsmitaHref(stack.slug)}']`)).toBeVisible();

      // The closing band: every tool in the stack, and the other stacks.
      await expect(page.getByRole("heading", { name: "All tools in this stack" })).toBeVisible();
      await expect(page.locator(".ot-stack-closecard")).toHaveCount(slugs.length);
      for (const slug of slugs) {
        await expect(page.locator(`.ot-stack-closecard a[href="/lab/open-tools/${slug}"]`).first()).toBeVisible();
      }
      await expect(page.getByRole("link", { name: "See the other stacks" })).toHaveAttribute("href", "/lab/stacks");

      // A step's tool link navigates to that tool page.
      await page
        .locator(`section[aria-labelledby="ot-step-${linkedStepNumber}"] a[href="/lab/open-tools/${firstToolSlug}"]`)
        .first()
        .click();
      await page.waitForURL(`**/lab/open-tools/${firstToolSlug}`, { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: firstTool.name, exact: true })).toBeVisible();
    });

    test(`stacks the ${stack.slug} phone pipeline vertically`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/lab/stacks/${stack.slug}`, { timeout: 120_000 });

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
  }

  test("reaches every stack from the directory and from tool pages' closing bands", async ({ page }) => {
    test.setTimeout(150_000);
    // The directory's hero link.
    await page.goto("/lab/open-tools", { timeout: 120_000 });
    await expect(page.getByRole("link", { name: "See the free stacks" })).toHaveAttribute("href", "/lab/stacks");
    await page.getByRole("link", { name: "See the free stacks" }).click();
    await page.waitForURL("**/lab/stacks", { timeout: 60_000 });

    // PDQ's closing band links both stacks that use it; the journey lands
    // on the first and back onto a tool page through a step's link.
    const pdq = getStack("stop-reuploads")!;
    await page.goto("/lab/open-tools/pdq");
    await expect(page.getByRole("heading", { name: "See it in a stack" })).toBeVisible();
    await page.getByRole("link", { name: pdq.title, exact: true }).click();
    await page.waitForURL("**/lab/stacks/stop-reuploads", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: pdq.title, exact: true })).toBeVisible();
    await page.locator('section[aria-labelledby="ot-step-2"] a[href="/lab/open-tools/vpdq"]').click();
    await page.waitForURL("**/lab/open-tools/vpdq", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "vPDQ", exact: true })).toBeVisible();

    // YuNet serves only the AI app stack; Osprey only the rules stack:
    // their closing bands now land on real WP154 pages.
    const aiApp = getStack("ai-app-guardrails")!;
    await page.goto("/lab/open-tools/yunet");
    await page.getByRole("link", { name: aiApp.title, exact: true }).click();
    await page.waitForURL("**/lab/stacks/ai-app-guardrails", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: aiApp.title, exact: true })).toBeVisible();

    const rules = getStack("rules-and-review")!;
    await page.goto("/lab/open-tools/osprey");
    await page.getByRole("link", { name: rules.title, exact: true }).click();
    await page.waitForURL("**/lab/stacks/rules-and-review", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: rules.title, exact: true })).toBeVisible();
  });

  test("answers 404 for an unknown stack slug", async ({ page }) => {
    test.setTimeout(150_000);
    const response = await page.goto("/lab/stacks/no-such-stack", { timeout: 120_000 });
    expect(response?.status()).toBe(404);
  });

  test("renders the Hindi chrome on the index and all three stack pages", async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();

    // The index: hero, card text and chips in Hindi, and — since WP154 —
    // a Read link on every card.
    await page.goto("/lab/stacks", { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "मुफ़्त स्टैक", exact: true })).toBeVisible();
    for (const stack of STACKS) {
      await expect(page.getByText(stack.hi.forWho)).toBeVisible();
      await expect(page.getByText(`${stack.hi.time} · ${stack.hi.people}`)).toBeVisible();
      await expect(page.locator(`a[href="/lab/stacks/${stack.slug}"].btn-secondary`)).toBeVisible();
    }
    await expect(page.getByText("अगले चरण में")).toHaveCount(0);

    // Every stack page: the English-only notice, translated chrome, and the
    // English body from the data.
    for (const stack of STACKS) {
      await page.goto(`/lab/stacks/${stack.slug}`, { timeout: 120_000 });
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
    }

    await context.close();
  });
});
