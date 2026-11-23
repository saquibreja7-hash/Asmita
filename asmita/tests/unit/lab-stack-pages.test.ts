import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// WP153 built the /lab/stacks index and the /lab/stacks/[slug] template
// behind the first stack; WP154 (docs/lab/open-tools-spec.md) completes the
// set: every stack in the WP150 data now has a page, so the index links all
// three cards and the "Coming next" state is gone. Each stack page renders
// the whole Part C3 template from the WP150 data — header, fact boxes, the
// pipeline diagram, numbered steps, plan, gaps, India notes, "Work with
// Asmita" and the closing band — and both pages answer 404 while the Lab
// is off. The live-browser behaviour is asserted by
// tests/e2e/lab-stacks.spec.ts.

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

import StacksPage, { metadata as indexMetadata } from "@/app/(public)/lab/stacks/page";
import StackPage, { generateMetadata, generateStaticParams } from "@/app/(public)/lab/stacks/[slug]/page";
import { BUILT_STACK_SLUGS, stackIsBuilt, WITH_ASMITA_LINK } from "@/app/(public)/lab/stacks/built-stacks";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";
import { getStack, STACKS } from "@/lib/lab/open-tools/stacks";
import { allPublicPaths } from "@/lib/site-map";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));

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

/** The tools one stack uses, in first-appearance order, deduplicated. */
function stackTools(slug: string) {
  const stack = getStack(slug)!;
  const slugs: string[] = [];
  for (const step of stack.steps) {
    for (const tool of step.tools) {
      if (!slugs.includes(tool)) slugs.push(tool);
    }
  }
  return slugs;
}

/** A static render with HTML entities decoded, so the assertions can
 * compare against the stacks' own strings. */
async function markup(element: React.ReactElement) {
  const html = renderToStaticMarkup(element as React.ReactElement);
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

async function indexMarkup(locale: "en" | "hi" = "en") {
  localeCookie = locale === "hi" ? "hi" : undefined;
  try {
    return await markup(await StacksPage());
  } finally {
    localeCookie = undefined;
  }
}

async function stackMarkup(slug: string, locale: "en" | "hi" = "en") {
  localeCookie = locale === "hi" ? "hi" : undefined;
  try {
    return await markup(await StackPage({ params: Promise.resolve({ slug }) }));
  } finally {
    localeCookie = undefined;
  }
}

async function expectStackNotFound(slug: string) {
  const rejection = await StackPage({ params: Promise.resolve({ slug }) }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(rejection).toBeTruthy();
  const digest = (rejection as { digest?: string })?.digest ?? String(rejection);
  expect(digest).toMatch(/404/);
}

describe("the stacks index gates and metadata", () => {
  it("answers 404 while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const rejection = await StacksPage().then(
      () => null,
      (error: unknown) => error,
    );
    vi.unstubAllEnvs();
    expect(rejection).toBeTruthy();
    const digest = (rejection as { digest?: string })?.digest ?? String(rejection);
    expect(digest).toMatch(/404/);
  });

  it("carries page metadata", () => {
    expect(indexMetadata.title).toBe("Free stacks");
    expect((indexMetadata.description ?? "").length).toBeGreaterThan(20);
  });

  it("has its page file behind the route the hub, the directory and the sitemap name", () => {
    for (const page of [
      join(asmitaDir, "src", "app", "(public)", "lab", "stacks", "page.tsx"),
      join(asmitaDir, "src", "app", "(public)", "lab", "stacks", "[slug]", "page.tsx"),
    ]) {
      expect(existsSync(page), page).toBe(true);
    }
    expect(allPublicPaths).toContain("/lab/stacks");
    const sitemapSource = readFileSync(join(asmitaDir, "src", "app", "(public)", "sitemap", "page.tsx"), "utf8");
    expect(sitemapSource).toContain('"/lab/stacks":');
  });
});

describe("the stacks index", () => {
  it("renders the hero and one card per stack, in the data's order", async () => {
    const html = await indexMarkup();
    expect(html).toContain('<h1 class="page-title mt-5">Free stacks</h1>');
    expect(html).toContain("Ready-made combinations of open tools for a specific job");
    expect(html).toContain("Three stacks for three kinds of organisation");

    const positions = STACKS.map((stack) => html.indexOf(stack.title));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const stack of STACKS) {
      expect(html).toContain(`<p class="ot-stacks-who">${stack.forWho}</p>`);
      expect(html).toContain(`${stack.time} · ${stack.people}`);
      // Every tool named in a step appears as a chip.
      for (const slug of stackTools(stack.slug)) {
        expect(html, `${stack.slug} names ${slug}`).toContain(`>${getOpenTool(slug)!.name}</li>`);
      }
    }
  });

  it("links every card to its stack page; no Coming next remains anywhere", async () => {
    const html = await indexMarkup();
    // WP154 removed the WP153 "Coming next" state: every stack is built, so
    // every card's job and button link its page and the chip is gone.
    expect(html).not.toContain("Coming next");
    for (const stack of STACKS) {
      expect(html).toContain(`href="/lab/stacks/${stack.slug}"`);
      expect(html).toContain(`ot-stacks-job"><a href="/lab/stacks/${stack.slug}" class="text-link">${stack.title}</a>`);
      expect(html).toContain(`href="/lab/stacks/${stack.slug}" class="btn btn-secondary"`);
      expect(html).toContain(">Read the stack</a>");
    }
    // Three card buttons plus the closing band's "Browse the open tools".
    expect(html.match(/class="btn btn-secondary"/g)?.length).toBe(STACKS.length + 1);
  });

  it("closes with the band linking the open tools directory", async () => {
    const html = await indexMarkup();
    expect(html).toContain("The tools behind these stacks");
    expect(html).toContain('href="/lab/open-tools"');
    expect(html).toContain(">Browse the open tools</a>");
  });

  it("renders the Hindi hero and card text", async () => {
    const html = await indexMarkup("hi");
    expect(html).toContain('<h1 class="page-title mt-5">मुफ़्त स्टैक</h1>');
    expect(html).toContain("तीन तरह की संस्थाओं के लिए तीन स्टैक");
    for (const stack of STACKS) {
      expect(html, stack.slug).toContain(`<p class="ot-stacks-who">${stack.hi.forWho}</p>`);
      expect(html, stack.slug).toContain(stack.hi.title);
      expect(html, stack.slug).toContain(`${stack.hi.time} · ${stack.hi.people}`);
      expect(html, stack.slug).toContain(`href="/lab/stacks/${stack.slug}"`);
    }
    expect(html.match(/>स्टैक पढ़ें</g)?.length).toBe(STACKS.length);
    // The English card text does not leak into the Hindi render.
    expect(html).not.toContain(STACKS[0].forWho);
  });
});

describe("the stack page gates", () => {
  it("answers 404 while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    await expectStackNotFound("stop-reuploads");
    vi.unstubAllEnvs();
  });

  it("answers 404 for an unknown slug", async () => {
    vi.stubEnv("ENABLE_LAB", "true");
    await expectStackNotFound("no-such-stack");
    vi.unstubAllEnvs();
  });

  it("renders every stack in the data (WP154 completed the set)", async () => {
    vi.stubEnv("ENABLE_LAB", "true");
    for (const stack of STACKS) {
      const html = await stackMarkup(stack.slug);
      expect(html, stack.slug).toContain(`page-title ot-stack-title">${stack.title}</h1>`);
    }
    vi.unstubAllEnvs();
  });

  it("declares exactly the built slugs in generateStaticParams", () => {
    expect(generateStaticParams().map((entry) => entry.slug)).toEqual([...BUILT_STACK_SLUGS]);
  });
});

// The full Part C3 template, asserted for every stack WP154 renders.
for (const stack of STACKS) {
  const tools = stackTools(stack.slug);
  const withAsmitaLink = WITH_ASMITA_LINK.get(stack.slug)!;
  const withAsmitaLabel = (en as Record<string, string>)[withAsmitaLink.labelKey];

  describe(`the ${stack.slug} stack page`, () => {
    it("renders the header: breadcrumb, title, For line, lede, fact boxes", async () => {
      const html = await stackMarkup(stack.slug);
      expect(html).toContain("<h1");
      expect(html).toContain(`page-title ot-stack-title">${stack.title}</h1>`);
      // Breadcrumb: AI Lab > Free stacks > the stack's job, current at the end.
      expect(html).toContain(">AI Lab</a>");
      expect(html).toContain('href="/lab/stacks"');
      expect(html).toContain("Free stacks</a>");
      expect(html).toContain(`aria-current="page">${stack.title}</span>`);
      // The For line, the lede, the three fact boxes.
      expect(html).toContain(`For:</span> ${stack.forWho}`);
      expect(html).toContain(`<p class="ot-stack-lede">${stack.lede}</p>`);
      expect(html).toContain("Time</dt>");
      expect(html).toContain(`<dd>${stack.time}</dd>`);
      expect(html).toContain("People</dt>");
      expect(html).toContain(`<dd>${stack.people}</dd>`);
      expect(html).toContain("Cost</dt>");
      expect(html).toContain(`<dd>${stack.resources}</dd>`);
    });

    it("renders the pipeline diagram twice: a row on desktop, a column on phones", async () => {
      const html = await stackMarkup(stack.slug);
      for (const variant of ["ot-pipeline-row-svg", "ot-pipeline-col-svg"]) {
        expect(html).toContain(variant);
      }
      // Both drawings are aria-hidden decoration with a title, and both
      // carry one marker per step.
      expect(html.match(/aria-hidden="true" focusable="false"/g)?.length).toBe(2);
      expect(html.match(/<title>/g)?.length).toBe(2);
      expect(html.match(/ot-dg-stepnum-bg/g)?.length).toBe(stack.steps.length * 2);
      // The tool names inside the drawing link to their tool pages, but sit
      // outside the tab order: the step sections carry the same links.
      for (const variant of ["row", "col"]) {
        expect(html).toContain(`class="ot-diagram ot-pipeline-${variant}"`);
      }
      // [a-z0-9-]: tool slugs can carry digits (c2pa).
      expect(html.match(/<a class="ot-dg-link" href="\/lab\/open-tools\/[a-z0-9-]+" tabindex="-1">/g)?.length).toBe(
        stack.steps.reduce((sum, step) => sum + step.tools.length, 0) * 2,
      );
    });

    it("renders one numbered section per step, in the diagram's order", async () => {
      const html = await stackMarkup(stack.slug);
      stack.steps.forEach((step, index) => {
        const number = index + 1;
        expect(html).toContain(`id="ot-step-${number}"`);
        expect(html).toContain(`class="ot-stack-stepnum" aria-hidden="true">${number}`);
        expect(html).toContain('class="section-title ot-stack-step-title"');
        expect(html).toContain(step.name);
        expect(html).toContain(step.what);
        expect(html).toContain(step.why);
        expect(html).toContain(`What you need:</span> ${step.need}`);
        expect(html).toContain(`Done when:</span> ${step.doneWhen}`);
        for (const mistake of step.mistakes) expect(html).toContain(mistake);
        for (const slug of step.tools) {
          expect(html).toContain(`href="/lab/open-tools/${slug}"`);
        }
      });
      // The Tools line names the tools (and only for steps that have them).
      expect(html.match(/<span class="ot-stack-label">Tools:<\/span>/g)?.length).toBe(
        stack.steps.filter((step) => step.tools.length > 0).length,
      );
      // The numbered sections come before the Plan, in order.
      const stepPositions = stack.steps.map(
        (_, index) => html.indexOf(`id="ot-step-${index + 1}"`),
      );
      expect(stepPositions.every((position) => position > -1)).toBe(true);
      expect([...stepPositions].sort((a, b) => a - b)).toEqual(stepPositions);
      expect(stepPositions[stepPositions.length - 1]).toBeLessThan(html.indexOf('id="ot-plan"'));
    });

    it("renders the plan columns, the gaps, the India notes and Work with Asmita", async () => {
      const html = await stackMarkup(stack.slug);
      // The plan.
      expect(html).toContain(">Plan</h2>");
      for (const label of ["Week 1", "Weeks 2–3", "Month 2"]) {
        expect(html).toContain(`<h3 class="ot-stack-plan-title">${label}</h3>`);
      }
      for (const items of [stack.plan.week1, stack.plan.weeks2to3, stack.plan.month2]) {
        for (const item of items) expect(html).toContain(item);
      }
      // The honest gaps.
      expect(html).toContain("What this will not catch</h2>");
      for (const gap of stack.wontCatch) expect(html).toContain(gap);
      // The India notes, ending with the not-legal-advice line.
      expect(html).toContain("India notes</h2>");
      for (const note of stack.indiaNotes) expect(html).toContain(note);
      const notLaw =
        "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer.";
      expect(html.indexOf(`class="ot-stack-notlaw">${notLaw}</p>`)).toBeGreaterThan(-1);
      // Work with Asmita, closing with this stack's mapped link.
      expect(html).toContain("Work with Asmita</h2>");
      for (const item of stack.withAsmita) expect(html).toContain(item);
      expect(html).toContain(`href="${withAsmitaLink.href}"`);
      expect(html).toContain(`${withAsmitaLabel} <span aria-hidden="true">→</span>`);
    });

    it("closes with every tool in the stack as a small card, and the other stacks", async () => {
      const html = await stackMarkup(stack.slug);
      expect(html).toContain("All tools in this stack</h2>");
      expect(html.match(/class="ot-stack-closecard"/g)?.length).toBe(tools.length);
      for (const slug of tools) {
        const tool = getOpenTool(slug)!;
        expect(html).toContain(`href="/lab/open-tools/${slug}"`);
        expect(html).toContain(
          `ot-stack-closetitle"><a href="/lab/open-tools/${slug}" class="text-link">${tool.name}</a>`,
        );
        expect(html).toContain(`by ${tool.maintainer}`);
      }
      expect(html).toContain('href="/lab/stacks"');
      expect(html).toContain("See the other stacks");
    });

    it("keeps its headings in order: one h1, the step and section h2s, h3s inside the plan", async () => {
      const html = await stackMarkup(stack.slug);
      expect(html.match(/<h1/g)?.length).toBe(1);
      // The fixed trailing sections follow the steps, in the spec's order.
      for (const id of ["ot-plan", "ot-wont", "ot-india", "ot-with"]) {
        expect(html).toContain(`<h2 id="${id}"`);
      }
      const order = ["ot-plan", "ot-wont", "ot-india", "ot-with"].map((id) => html.indexOf(`id="${id}"`));
      expect(order.every((position) => position > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("renders the Hindi chrome with the English-only notice and English body", async () => {
      const html = await stackMarkup(stack.slug, "hi");
      expect(html).toContain("यह पृष्ठ अंग्रेज़ी में है क्योंकि यह तकनीकी टीमों के लिए लिखा गया है।");
      expect(html).not.toContain("This page is in English because it is written for technical teams.");
      // Translated chrome: breadcrumb, fact labels, section headings, plan.
      expect(html).toContain("AI लैब");
      expect(html).toContain("किसके लिए:</span>");
      expect(html).toContain("समय</dt>");
      expect(html).toContain("लोग</dt>");
      expect(html).toContain("लागत</dt>");
      expect(html).toContain("योजना</h2>");
      expect(html).toContain('<h3 class="ot-stack-plan-title">सप्ताह 1</h3>');
      expect(html).toContain("जिन्हें यह स्टैक नहीं पकड़ेगा</h2>");
      expect(html).toContain("भारत के संदर्भ में</h2>");
      expect(html).toContain("अस्मिता के साथ काम</h2>");
      expect(html).toContain("इस स्टैक के सभी टूल</h2>");
      expect(html).toContain("दूसरे स्टैक देखें");
      // The body stays English: the data's own strings.
      expect(html).toContain(stack.title);
      expect(html).toContain(stack.steps[0].what);
      expect(html).toContain(stack.indiaNotes[0]);
    });

    it("carries the spec's metadata", async () => {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug: stack.slug }) });
      expect(metadata.title).toBe(`${stack.title} — Free stacks — Asmita AI Lab`);
      expect(metadata.description).toBe(stack.lede);
    });
  });
}

describe("the WP150 stacks data carries Hindi card text (Part C6)", () => {
  it("has a complete hi block on every stack, without exclamation marks", () => {
    for (const stack of STACKS) {
      for (const field of ["title", "forWho", "time", "people"] as const) {
        expect((stack.hi[field] as string).trim().length, `${stack.slug}.hi.${field}`).toBeGreaterThan(0);
        expect(stack.hi[field], `${stack.slug}.hi.${field}`).not.toContain("!");
      }
      expect(stack.hi.title, stack.slug).not.toBe(stack.title);
      expect(stack.hi.forWho, stack.slug).not.toBe(stack.forWho);
    }
  });
});

describe("the built-stacks module and the Work-with-Asmita links", () => {
  it("marks every stack in the data as built, and only those are declared", () => {
    expect([...BUILT_STACK_SLUGS]).toEqual(STACKS.map((stack) => stack.slug));
    for (const stack of STACKS) {
      expect(stackIsBuilt(stack.slug), stack.slug).toBe(true);
    }
    expect(stackIsBuilt("no-such-stack")).toBe(false);
  });

  it("gives every stack a closing link in the Work with Asmita section", () => {
    for (const stack of STACKS) {
      const link = WITH_ASMITA_LINK.get(stack.slug);
      expect(link, stack.slug).toBeDefined();
      expect(link!.href.startsWith("/")).toBe(true);
    }
    expect(WITH_ASMITA_LINK.get("stop-reuploads")!.href).toBe("/for-platforms");
    expect(WITH_ASMITA_LINK.get("rules-and-review")!.href).toBe("/for-platforms");
    expect(WITH_ASMITA_LINK.get("ai-app-guardrails")!.href).toBe("/feedback");
  });
});

describe("the new lab.stacks i18n keys", () => {
  const STACK_KEYS = [
    "lab.stacks.title",
    "lab.stacks.lede",
    "lab.stacks.index.heading",
    "lab.stacks.index.read",
    "lab.stacks.index.toolsLabel",
    "lab.stacks.index.close.title",
    "lab.stacks.index.close.body",
    "lab.stacks.index.close.cta",
    "lab.stacks.page.for",
    "lab.stacks.page.time",
    "lab.stacks.page.people",
    "lab.stacks.page.cost",
    "lab.stacks.page.step.tools",
    "lab.stacks.page.step.need",
    "lab.stacks.page.step.doneWhen",
    "lab.stacks.page.step.mistakes",
    "lab.stacks.page.plan",
    "lab.stacks.plan.week1",
    "lab.stacks.plan.weeks2to3",
    "lab.stacks.plan.month2",
    "lab.stacks.page.wontCatch",
    "lab.stacks.page.indiaNotes",
    "lab.stacks.page.withAsmita",
    "lab.stacks.page.forPlatforms",
    "lab.stacks.page.feedback",
    "lab.stacks.page.close.title",
    "lab.stacks.page.close.others",
  ];

  it("exists in both dictionaries, exactly this key set, non-empty", () => {
    const inDictionaries = Object.keys(en).filter((key) => key.startsWith("lab.stacks."));
    expect(inDictionaries.sort()).toEqual([...STACK_KEYS].sort());
    for (const key of STACK_KEYS) {
      expect((en as Record<string, string>)[key].trim().length, `en ${key}`).toBeGreaterThan(0);
      expect((hi as Record<string, string>)[key].trim().length, `hi ${key}`).toBeGreaterThan(0);
      // The Hindi is Hindi, not a copy of the English.
      expect((hi as Record<string, string>)[key], `hi ${key}`).not.toBe((en as Record<string, string>)[key]);
    }
  });

  it("keeps the owner's banned marketing words and exclamation marks out", () => {
    for (const key of STACK_KEYS) {
      for (const dictionary of [en, hi] as Record<string, string>[]) {
        const value = dictionary[key].toLowerCase();
        for (const word of BANNED_WORDS) expect(value, `${key}: ${word}`).not.toContain(word);
        expect(dictionary[key], key).not.toContain("!");
      }
    }
  });

  it("records the keys as machine translated and the route as English-only", () => {
    const status = JSON.parse(readFileSync(join(asmitaDir, "src", "i18n", "hi-review-status.json"), "utf8"));
    expect(status.machineTranslated.keys).toContain("lab.stacks.*");
    expect(status.machineTranslated.by).toContain("WP153");
    expect(
      status.excludedFromTranslation.some(
        (entry: string) => entry.startsWith("/lab/stacks/[slug]") && entry.includes("English only"),
      ),
    ).toBe(true);
  });

  it("keeps the tool page and directory key sets untouched", () => {
    // WP151's exact-set contract still holds over its own namespaces.
    const openToolsKeys = Object.keys(en).filter(
      (key) => key.startsWith("lab.openTools.") || key.startsWith("lab.sections."),
    );
    expect(openToolsKeys.length).toBeGreaterThan(80);
    const inHi = Object.keys(hi).filter((key) => key.startsWith("lab.openTools.") || key.startsWith("lab.sections."));
    expect(inHi.sort()).toEqual(openToolsKeys.sort());
  });
});
