// The WP155 full audit (docs/lab/open-tools-spec.md, Part G WP155): a
// pass over every page this feature built — the Lab hub, the directory,
// the 18 tool pages, how-we-choose, the stacks index and the three
// stack pages. Each page is checked for heading order, one h1, 48px tap
// targets on every control, honest link text, the hidden label on
// every external link, and the banned-words and exclamation rules; the
// Hindi locale is checked at 320px for horizontal overflow and clipped
// Devanagari. The directory's filters are driven from the keyboard
// alone with visible focus, reduced motion is honoured, and
// how-we-choose reads fully without JavaScript.

import { expect, test, type Page } from "@playwright/test";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { filterTools } from "@/lib/lab/open-tools/filters";
import { STACKS } from "@/lib/lab/open-tools/stacks";

const BANNED_WORDS = [
  "revolutionary",
  "cutting-edge",
  "seamless",
  "robust",
  "leverage",
  "empower",
  "harness",
  "game-changer",
  "unlock",
  "state-of-the-art",
  "comprehensive solution",
  "in today's digital landscape",
];

/** Every page this feature built (WP151-155), including the two hub
 * cards' pages. */
const PAGES: string[] = [
  "/lab",
  "/lab/open-tools",
  "/lab/open-tools/how-we-choose",
  ...OPEN_TOOLS.map((tool) => `/lab/open-tools/${tool.slug}`),
  "/lab/stacks",
  ...STACKS.map((stack) => `/lab/stacks/${stack.slug}`),
];

/** The wide-screen audit: heading order, one h1, tap targets, link
 * text, external-link labels, banned words. Runs in the page so one
 * pass covers the whole DOM. */
async function auditWide(page: Page): Promise<string[]> {
  return page.evaluate((banned: string[]) => {
    const issues: string[] = [];
    const doc = document.scrollingElement;
    if (doc && doc.scrollWidth > window.innerWidth + 1) {
      issues.push(`document overflows horizontally (${doc.scrollWidth}px at ${window.innerWidth}px)`);
    }
    const main = document.querySelector("main");
    if (!main) return ["no main element"];

    // Headings in order: no level skips downward, exactly one h1.
    const headings = Array.from(main.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    let previous = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName[1]);
      if (previous && level > previous + 1) {
        issues.push(`heading skips h${previous} to h${level}: ${(heading.textContent ?? "").trim().slice(0, 50)}`);
      }
      previous = level;
    }
    const h1s = headings.filter((heading) => heading.tagName === "H1");
    if (h1s.length !== 1) issues.push(`expected exactly one h1, found ${h1s.length}`);

    // Tap targets: every control in the content is at least 48px tall.
    for (const el of Array.from(main.querySelectorAll("button, input"))) {
      const height = el.getBoundingClientRect().height;
      if (height > 0 && height < 48) {
        issues.push(`control under 48px (${Math.round(height)}px): ${el.outerHTML.slice(0, 60)}`);
      }
    }

    // Link text: non-empty, no generic filler, every external link
    // carries the visually hidden "(opens the official site)" label.
    const generic = new Set(["here", "click here", "link", "this", "read more", "more"]);
    for (const link of Array.from(main.querySelectorAll("a"))) {
      const href = link.getAttribute("href") ?? "";
      const text = (link.textContent ?? "").trim().toLowerCase();
      if (!text) {
        issues.push(`link without text: ${href}`);
        continue;
      }
      if (generic.has(text)) issues.push(`generic link text: "${text}"`);
      if (href.startsWith("http") && !link.querySelector(".sr-only")) {
        issues.push(`external link without the hidden label: ${href}`);
      }
    }

    // The banned-words and exclamation rules over the rendered copy.
    const copy = (main as HTMLElement).innerText.toLowerCase();
    for (const word of banned) {
      if (copy.includes(word)) issues.push(`banned word: ${word}`);
    }
    if ((main as HTMLElement).innerText.includes("!")) issues.push("exclamation mark in the copy");

    return issues;
  }, BANNED_WORDS);
}

/** The narrow Hindi audit: no document overflow and no element that
 * clips its own text — Devanagari included. Elements inside an
 * intentional horizontal scroller (the stage strip, the diagram boxes)
 * are allowed to extend past the edge. */
async function auditNarrow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    const doc = document.scrollingElement;
    if (doc && doc.scrollWidth > window.innerWidth + 1) {
      issues.push(`document overflows horizontally (${doc.scrollWidth}px at ${window.innerWidth}px)`);
    }
    const main = document.querySelector("main");
    if (!main) return ["no main element"];

    const insideScroller = (el: Element): boolean => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (!(node instanceof HTMLElement)) continue;
        const style = getComputedStyle(node);
        if (style.overflowX === "auto" || style.overflowX === "scroll") return true;
      }
      return false;
    };

    for (const el of Array.from(main.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.classList.contains("sr-only")) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (style.display.startsWith("inline")) continue;
      if (!(el.textContent ?? "").trim()) continue;
      const name = `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 40)}">`;
      // A box with hidden overflow that cannot hold its own text.
      const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
      const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
      if (clipsX && el.scrollWidth > el.clientWidth + 2) {
        issues.push(`clipped text horizontally: ${name} content ${el.scrollWidth}px in ${el.clientWidth}px`);
      }
      if (clipsY && el.scrollHeight > el.clientHeight + 2) {
        issues.push(`clipped text vertically: ${name} content ${el.scrollHeight}px in ${el.clientHeight}px`);
      }
      // A text element laid out past the viewport, not inside a scroller.
      if (!insideScroller(el)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && (rect.right > window.innerWidth + 2 || rect.left < -2)) {
          issues.push(`element outside the viewport: ${name} at ${Math.round(rect.left)}..${Math.round(rect.right)} of ${window.innerWidth}px`);
        }
      }
    }
    return issues;
  });
}

test.describe("AI Lab open tools audit, WP155", () => {
  /** Waits for the client half to hydrate where it exists, so the audit
   * measures the full page: the directory's filter buttons and the code
   * blocks' copy buttons render only after hydration. */
  const settle = async (page: Page, url: string) => {
    if (url === "/lab/open-tools") {
      await page.getByRole("button", { name: "All", exact: true }).waitFor();
      return;
    }
    if ((await page.locator(".ot-code").count()) > 0) {
      await page.getByRole("button", { name: "Copy", exact: true }).first().waitFor();
    }
  };

  test("every built page passes the wide-screen audit", async ({ page }) => {
    test.setTimeout(600_000);
    // Warm the two dynamic route segments first: the dev server compiles
    // a route on first request and a cold compile can outlast a single
    // wait in the e2e container (the WP152 lesson).
    await page.goto(`/lab/open-tools/${OPEN_TOOLS[0].slug}`, { timeout: 120_000 });
    await page.goto(`/lab/stacks/${STACKS[0].slug}`, { timeout: 120_000 });

    for (const url of PAGES) {
      await page.goto(url);
      await settle(page, url);
      const findings = await auditWide(page);
      expect(findings, url).toEqual([]);
    }
  });

  test("the directory shows the three Not-open-source chips and the one From Asmita chip", async ({ page }) => {
    await page.goto("/lab/open-tools");
    // Scoped to the chip elements: the group heading "From Asmita" and the
    // category chip "Free services (not open source)" carry the same words.
    await expect(page.locator("span.ot-chip-closed")).toHaveCount(3);
    await expect(page.locator("span.ot-chip-asmita")).toHaveCount(1);
    await expect(page.locator("span.ot-chip-closed").first()).toHaveText("Not open source");
    await expect(page.locator("span.ot-chip-asmita")).toHaveText("From Asmita");
  });

  test("every tool page carries its credit line and its chips", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(`/lab/open-tools/${OPEN_TOOLS[0].slug}`, { timeout: 120_000 });

    for (const tool of OPEN_TOOLS) {
      await page.goto(`/lab/open-tools/${tool.slug}`);
      const credit = page.locator(".ot-credit");
      await expect(credit, tool.slug).toContainText(
        tool.fromAsmita ? "Meri Asmita" : "Asmita did not build it",
      );
      await expect(credit, tool.slug).toContainText(tool.maintainer);
      if (!tool.openSource) {
        // Scoped to the closed chip: the category chip next to it reads
        // "Free services (not open source)" and would match a text query.
        await expect(page.locator(".ot-tool-chips .ot-chip-closed"), tool.slug).toBeVisible();
        await expect(page.locator(".ot-tool-chips .ot-chip-closed"), tool.slug).toHaveText(
          "Not open source",
        );
      }
      if (tool.fromAsmita) {
        await expect(page.locator(".ot-tool-chips .ot-chip-asmita"), tool.slug).toBeVisible();
        await expect(page.locator(".ot-tool-chips .ot-chip-asmita"), tool.slug).toHaveText(
          "From Asmita",
        );
      }
    }
  });

  test("every built page holds at 320px in Hindi, with no clipped Devanagari", async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 320, height: 700 },
    });
    await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    const page = await context.newPage();
    await page.goto(`/lab/open-tools/${OPEN_TOOLS[0].slug}`, { timeout: 120_000 });
    await page.goto(`/lab/stacks/${STACKS[0].slug}`, { timeout: 120_000 });

    for (const url of PAGES) {
      await page.goto(url);
      const findings = await auditNarrow(page);
      expect(findings, url).toEqual([]);
    }
    await context.close();
  });

  test("the directory's filters work from the keyboard alone, with visible focus", async ({ page }) => {
    await page.goto("/lab/open-tools");
    await page.getByRole("button", { name: "All", exact: true }).waitFor();

    const prevent = filterTools(OPEN_TOOLS, { stage: "prevent" });
    const both = filterTools(OPEN_TOOLS, { stage: "prevent", audience: "ai-app" });

    /** Tab until the named control is the active element. Inputs match
     * by id (they have no text content). */
    const tabTo = async (want: string) => {
      for (let i = 0; i < 80; i++) {
        const hit = await page.evaluate(() => {
          const el = document.activeElement;
          if (el instanceof HTMLElement && (el.tagName === "BUTTON" || el.tagName === "INPUT")) {
            return el.id || el.textContent?.trim() || "";
          }
          return null;
        });
        if (hit === want) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`never reached "${want}" by Tab`);
    };

    // Stage filter from the keyboard, with the focus ring showing.
    await tabTo("Prevent");
    const focusStyle = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return "";
      const style = getComputedStyle(el);
      return `${style.outlineStyle} ${style.outlineWidth}`;
    });
    expect(focusStyle).toContain("2px");
    await page.keyboard.press("Enter");
    await expect(page.locator("article.ot-card")).toHaveCount(prevent.length);
    await expect(page.getByRole("button", { name: "Prevent", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The audience chip ANDs with the stage, still keyboard-only.
    await tabTo("an AI app");
    await page.keyboard.press("Enter");
    await expect(page.locator("article.ot-card")).toHaveCount(both.length);

    // The search box types, empties the results and offers the way back.
    await tabTo("ot-search-input");
    await page.keyboard.type("nothing matches this");
    await expect(page.locator("article.ot-card")).toHaveCount(0);
    await expect(page.getByText("No tool matches those filters.")).toBeVisible();
    await tabTo("Clear filters");
    await page.keyboard.press("Enter");
    await expect(page.locator("article.ot-card")).toHaveCount(OPEN_TOOLS.length);
  });

  test("honours prefers-reduced-motion on the filter controls", async ({ page }) => {
    await page.goto("/lab/open-tools");
    await page.getByRole("button", { name: "All", exact: true }).waitFor();
    const button = page.getByRole("button", { name: "Prevent", exact: true });
    const fullMotion = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(fullMotion)).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotion = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(reducedMotion).toBe("0s");
  });

  test("how-we-choose reads fully without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/open-tools/how-we-choose");

    await expect(page.getByRole("heading", { name: "How we choose tools", exact: true })).toBeVisible();
    for (const heading of [
      "What 'open' means here",
      "What we check before listing",
      "What we do not list",
      "Suggest a tool or report an error",
      "Credit",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    // The page is fully static: no dead controls without JavaScript.
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);

    await context.close();
  });
});
