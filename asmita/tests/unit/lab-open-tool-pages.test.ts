import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// WP152 (docs/lab/open-tools-spec.md): the /lab/open-tools/[slug] template.
// Every catalogue slug must render its required sections from the
// catalogue's own data, "How Asmita uses it" appears only where the
// catalogue has asmitaUse, the credit card names the maintainer and the
// licence, unknown slugs and a switched-off Lab answer 404, and the Hindi
// locale shows the English-only notice while the body stays English. The
// live-browser behaviour (copy button, filtering journeys) is asserted by
// tests/e2e/lab-open-tool-page.spec.ts.

vi.mock("next/link", () => ({
  // next/link needs the app router; a plain anchor carries the same markup
  // contract here (href and children).
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));
vi.mock("@/components/layout/AppShell", () => ({
  // AppShell is an async server component (it awaits cookies), which the
  // synchronous renderToStaticMarkup cannot run; the assertions are all
  // about the page's own content, so the shell renders as itself.
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  // getLocale() outside a request: an empty cookie store reads as English;
  // setting the language cookie renders the Hindi chrome.
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "asmita_lang" && localeCookie ? { value: localeCookie } : undefined),
  })),
}));

import OpenToolPage, { generateMetadata, generateStaticParams } from "@/app/(public)/lab/open-tools/[slug]/page";
import { OPEN_TOOLS, getOpenTool } from "@/lib/lab/open-tools/catalogue";
import { stacksUsingTool } from "@/lib/lab/open-tools/stacks";
import type { OpenTool } from "@/lib/lab/open-tools/types";

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));

/** The static (no-JS) render of one tool page, with HTML entities in text
 *  decoded, so assertions can compare against the catalogue's own strings. */
async function toolMarkup(slug: string, locale: "en" | "hi" = "en") {
  localeCookie = locale === "hi" ? "hi" : undefined;
  try {
    const element = await OpenToolPage({ params: Promise.resolve({ slug }) });
    const html = renderToStaticMarkup(element);
    return html
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&");
  } finally {
    localeCookie = undefined;
  }
}

async function expectNotFound(slug: string) {
  const rejection = await OpenToolPage({ params: Promise.resolve({ slug }) }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(rejection).toBeTruthy();
  const digest = (rejection as { digest?: string })?.digest ?? String(rejection);
  expect(digest).toMatch(/404/);
}

const SECTION_HEADING_EN = [
  "What it does",
  "How it works",
  "Where it fits in a workflow",
  "What you get",
  "What it cannot do",
  "How to start",
  "Credit",
  "Related tools",
  "Sources",
];

describe("the tool page gates", () => {
  it("answers 404 while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    await expectNotFound("pdq");
    vi.unstubAllEnvs();
  });

  it("answers 404 for an unknown slug", async () => {
    vi.stubEnv("ENABLE_LAB", "true");
    await expectNotFound("not-a-real-tool");
    vi.unstubAllEnvs();
  });

  it("declares every catalogue slug in generateStaticParams", () => {
    expect(generateStaticParams().map((entry) => entry.slug).sort()).toEqual(
      [...OPEN_TOOLS.map((tool) => tool.slug)].sort(),
    );
  });
});

describe("every tool page renders its required sections", () => {
  for (const tool of OPEN_TOOLS) {
    // One render per tool, reused by the assertions below.
    let html = "";
    const render = (() => {
      let promise: Promise<string> | null = null;
      return () => (promise ??= toolMarkup(tool.slug));
    })();
    // Render lazily inside each `it` so a failure names the tool.
    const getHtml = () => render();

    it(`${tool.slug}: header, breadcrumb, chips and the aside`, async () => {
      html = await getHtml();
      expect(html).toContain(`<h1 class="page-title ot-tool-title">${tool.name}</h1>`);
      expect(html).toContain('href="/lab"');
      expect(html).toContain(">AI Lab</a>");
      expect(html).toContain('href="/lab/open-tools"');
      expect(html).toContain(`aria-current="page">${tool.name}</span>`);
      // The maintainer line links the maintainer's repository or site.
      expect(html).toContain(`href="${tool.maintainerUrl}"`);
      // The chips row: licence, category, and the special chips.
      expect(html).toContain(`class="ot-chip ot-chip-licence">${tool.licence}</span>`);
      if (!tool.openSource) expect(html).toContain(">Not open source</span>");
      if (tool.fromAsmita) expect(html).toContain(">From Asmita</span>");
      // The aside facts.
      expect(html).toContain("At a glance");
      expect(html).toContain(tool.kind);
      expect(html).toContain(tool.runsOn);
      expect(html).toContain(tool.effortNote);
      expect(html).toContain("Stages");
      expect(html).toMatch(/Last checked 22 November 2026/);
      expect(html).toContain(tool.licenceUrl);
    });

    it(`${tool.slug}: the nine fixed sections in order, carrying the catalogue data`, async () => {
      html = await getHtml();
      const positions = SECTION_HEADING_EN.map((heading) => html.indexOf(`>${heading}</h2>`));
      // Every heading present and rendered in the spec's order.
      expect(positions.every((position) => position > -1)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);

      // The catalogue bodies are all on the page.
      for (const paragraph of tool.whatItDoes) expect(html).toContain(paragraph);
      for (const step of tool.howItWorks) expect(html).toContain(step);
      for (const fit of tool.fitsWhere) expect(html).toContain(fit);
      for (const feature of tool.features) expect(html).toContain(feature);
      for (const limit of tool.limits) expect(html).toContain(limit);
      for (const step of tool.gettingStarted) expect(html).toContain(step.step);
    });

    it(`${tool.slug}: "How Asmita uses it" only when the catalogue has asmitaUse`, async () => {
      html = await getHtml();
      const hasSection = html.includes(">How Asmita uses it</h2>");
      expect(hasSection).toBe(tool.asmitaUse !== undefined);
      if (tool.asmitaUse) expect(html).toContain(tool.asmitaUse);
    });

    it(`${tool.slug}: the credit card names the maintainer and the licence`, async () => {
      html = await getHtml();
      expect(html).toContain("ot-credit");
      expect(html).toContain(tool.maintainer);
      expect(html).toContain(tool.licence);
      if (tool.fromAsmita) {
        // The one "From Asmita" entry names what Asmita built on.
        expect(html).toContain("made by Meri Asmita");
        expect(html).toContain("builds on the PDQ and vPDQ");
      } else {
        expect(html).toContain("Asmita did not build it");
        expect(html).toContain(`is not affiliated with ${tool.maintainer}`);
      }
      expect(html).toContain(tool.repoUrl ?? tool.maintainerUrl);
      if (tool.paper) expect(html).toContain(tool.paper);
    });

    it(`${tool.slug}: related tools as cards and every source listed`, async () => {
      html = await getHtml();
      expect(html.match(/class="ot-card"/g)?.length).toBe(tool.related.length);
      for (const relatedSlug of tool.related) {
        const related = getOpenTool(relatedSlug);
        expect(related).toBeTruthy();
        expect(html).toContain(`href="/lab/open-tools/${relatedSlug}"`);
        expect(html).toContain(`>${related!.name}</a>`);
      }
      for (const source of tool.sources) expect(html).toContain(source);
    });

    it(`${tool.slug}: a diagram for its kind, and only for its kind`, async () => {
      html = await getHtml();
      const hasSvg = html.includes("ot-diagram");
      expect(hasSvg).toBe(tool.diagram !== "none");
      if (tool.diagram !== "none") {
        expect(html).toContain("<svg");
        expect(html).toContain("<title>");
        // The drawing is decoration: the list carries the meaning.
        expect(html).toContain('aria-hidden="true"');
      }
    });

    it(`${tool.slug}: code snippets only where the catalogue has them, never a button before hydration`, async () => {
      html = await getHtml();
      const hasCode = tool.gettingStarted.some((step) => step.code);
      expect(html.includes("<pre><code>")).toBe(hasCode);
      if (hasCode) {
        for (const step of tool.gettingStarted) {
          if (step.code) expect(html).toContain(step.code);
        }
      }
      // The copy button renders only after hydration (no-JS contract).
      expect(html).not.toMatch(/<button[\s>]/i);
    });

    it(`${tool.slug}: external links carry the external hint and open in the same tab`, async () => {
      html = await getHtml();
      expect(html).toContain("(opens the official site)");
      expect(html).not.toContain('target="_blank"');
      expect(html).not.toContain('rel="noopener');
    });

    it(`${tool.slug}: the closing band links the stacks that use the tool`, async () => {
      html = await getHtml();
      const stacks = stacksUsingTool(tool.slug);
      expect(html).toContain("See it in a stack");
      for (const stack of stacks) {
        expect(html).toContain(`href="/lab/stacks/${stack.slug}"`);
        expect(html).toContain(stack.title);
      }
      if (stacks.length === 0) {
        expect(html).toContain("This tool is not part of one of our stack guides yet.");
        expect(html).toContain('href="/lab/open-tools"');
      }
    });
  }
});

describe("the Hindi render of a tool page", () => {
  const pdq = OPEN_TOOLS.find((tool) => tool.slug === "pdq") as OpenTool;

  it("shows the English-only notice and translated chrome, English body", async () => {
    const html = await toolMarkup("pdq", "hi");
    // The spec's exact notice line, translated.
    expect(html).toContain(
      "यह पृष्ठ अंग्रेज़ी में है क्योंकि यह तकनीकी टीमों के लिए लिखा गया है।",
    );
    expect(html).not.toContain("This page is in English because it is written for technical teams.");
    // Translated chrome: breadcrumb, aside title, section headings.
    expect(html).toContain("AI लैब");
    expect(html).toContain("एक नज़र में");
    expect(html).toContain("यह क्या करता है");
    expect(html).toContain("श्रेय");
    // The body stays English: the catalogue prose is untranslated data.
    expect(html).toContain(pdq.whatItDoes[0]);
    // The checked date renders in Hindi.
    expect(html).toMatch(/अंतिम जाँच/);
  });

  it("shows the English notice in neither dictionary leak nor the English page", async () => {
    const html = await toolMarkup("pdq", "en");
    expect(html).not.toContain("englishNotice");
    expect(html).not.toContain("यह पृष्ठ अंग्रेज़ी");
  });
});

describe("the tool page metadata", () => {
  it('titles every tool "{name} · Open tools · Asmita AI Lab" and describes it with summary.en', async () => {
    for (const tool of OPEN_TOOLS) {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug: tool.slug }) });
      expect(metadata.title, tool.slug).toBe(`${tool.name} · Open tools · Asmita AI Lab`);
      expect(metadata.description, tool.slug).toBe(tool.summary.en);
    }
  });

  it("falls back for an unknown slug", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "nope" }) });
    expect(metadata.title).toBe("Open tools · Asmita AI Lab");
  });
});

describe("the stacksUsingTool helper", () => {
  it("finds the stacks whose steps use a tool, in STACKS order", () => {
    expect(stacksUsingTool("pdq").map((stack) => stack.slug)).toEqual([
      "stop-reuploads",
      "rules-and-review",
    ]);
    expect(stacksUsingTool("yunet").map((stack) => stack.slug)).toEqual(["ai-app-guardrails"]);
  });

  it("is empty for the tools no stack uses", () => {
    expect(stacksUsingTool("tmk-pdqf")).toEqual([]);
    expect(stacksUsingTool("altitude")).toEqual([]);
    expect(stacksUsingTool("awesome-safety-tools")).toEqual([]);
    expect(stacksUsingTool("roost-model-community")).toEqual([]);
  });

  it("covers every catalogue tool without throwing", () => {
    for (const tool of OPEN_TOOLS) {
      for (const stack of stacksUsingTool(tool.slug)) {
        expect(stack.steps.some((step) => step.tools.includes(tool.slug))).toBe(true);
      }
    }
  });
});

describe("the translation status record", () => {
  it("excludes the tool page bodies from translation with the reason", () => {
    const status = JSON.parse(
      readFileSync(join(asmitaDir, "src", "i18n", "hi-review-status.json"), "utf8"),
    );
    expect(
      status.excludedFromTranslation.some(
        (entry: string) => entry.startsWith("/lab/open-tools/[slug]") && entry.includes("English only"),
      ),
    ).toBe(true);
    expect(status.machineTranslated.by).toContain("WP152");
  });
});
