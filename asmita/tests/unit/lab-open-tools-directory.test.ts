import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// WP151 (docs/lab/open-tools-spec.md): the /lab/open-tools directory page,
// its filter components and the Lab hub's two section cards. The directory
// is server-rendered for a visitor without JavaScript, so its static markup
// already carries every card — and no filter control, which appears only
// after hydration. The live filtering behaviour is asserted by
// tests/e2e/lab-open-tools.spec.ts.

vi.mock("next/link", () => ({
  // next/link needs the app router; a plain anchor carries the same markup
  // contract here (href and children).
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));
vi.mock("next/headers", () => ({
  // getLocale() outside a request: an empty cookie store reads as English.
  cookies: vi.fn(async () => new Map()),
}));

import { OpenToolsDirectory } from "@/app/(public)/lab/open-tools/OpenToolsDirectory";
import { WorkflowStrip } from "@/app/(public)/lab/open-tools/WorkflowStrip";
import OpenToolsPage, { metadata } from "@/app/(public)/lab/open-tools/page";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { CATEGORY_ORDER, STAGE_ORDER } from "@/lib/lab/open-tools/filters";
import type { Effort } from "@/lib/lab/open-tools/types";
import { LAB_BETA_TOOLS, LAB_HUB_SECTIONS } from "@/lib/lab/beta-tools";
import { allPublicPaths } from "@/lib/site-map";
import { navGroups } from "@/components/layout/nav-config";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));

const CATEGORY_HEADING_EN: Record<string, string> = {
  matching: "Matching and hashing",
  review: "Review and rules",
  models: "Detection models",
  provenance: "Provenance",
  services: "Free services (not open source)",
  asmita: "From Asmita",
  directories: "Directories",
};

const EFFORT_FILLED: Record<Effort, number> = { low: 1, medium: 2, high: 3, none: 0 };

/** The static (no-JS) render of the whole directory: every card, no filters. */
function directoryMarkup(locale: "en" | "hi" = "en") {
  return renderToStaticMarkup(
    createElement(OpenToolsDirectory, { tools: OPEN_TOOLS, locale }),
  );
}

describe("the /lab/open-tools page and its Lab gate", () => {
  it("answers 404 while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const rejection = await OpenToolsPage().then(
      () => null,
      (error: unknown) => error,
    );
    vi.unstubAllEnvs();
    expect(rejection).toBeTruthy();
    const digest = (rejection as { digest?: string })?.digest ?? String(rejection);
    expect(digest).toMatch(/404/);
  });

  it("renders past the gate while the Lab is on", async () => {
    vi.stubEnv("ENABLE_LAB", "true");
    const page = await OpenToolsPage();
    vi.unstubAllEnvs();
    expect(page).toBeTruthy();
  });

  it("carries page metadata", () => {
    expect(metadata.title).toBe("Open tools for trust and safety");
    expect((metadata.description ?? "").length).toBeGreaterThan(20);
  });

  it("has its page file behind the route the hub and sitemap name", () => {
    const page = join(asmitaDir, "src", "app", "(public)", "lab", "open-tools", "page.tsx");
    expect(existsSync(page)).toBe(true);
  });
});

describe("the server-rendered directory (the no-JavaScript contract)", () => {
  const html = directoryMarkup();

  it("shows every catalogue tool as a card whose title links to its page", () => {
    for (const tool of OPEN_TOOLS) {
      expect(html, tool.slug).toContain(`href="/lab/open-tools/${tool.slug}"`);
      expect(html, tool.slug).toContain(`>${tool.name}</a>`);
    }
  });

  it("groups the cards under the seven category headings, in the spec's order", () => {
    const positions = CATEGORY_ORDER.map((category) =>
      html.indexOf(`<h2 id="ot-group-${category}" class="section-title">${CATEGORY_HEADING_EN[category]}</h2>`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders no filter control before hydration: no button, no search input", () => {
    expect(html).not.toMatch(/<button[\s>]/i);
    expect(html).not.toMatch(/<input[\s>]/i);
    expect(html).not.toContain('role="status"');
  });

  it("marks the non-open-source tools and the one From Asmita tool with chips", () => {
    expect(html.match(/class="ot-chip ot-chip-closed"/g)?.length).toBe(3);
    expect(html.match(/class="ot-chip ot-chip-asmita"/g)?.length).toBe(1);
    expect(html).toContain("Not open source");
    expect(html).toContain("From Asmita");
  });

  it("shows each tool's licence as text in a monospace chip", () => {
    expect(html).toContain('class="ot-chip ot-chip-licence"');
    expect(html).toContain("BSD-3-Clause");
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain("Free service");
  });

  it("credits the maintainer on every card", () => {
    expect(html.match(/by Meta \(ThreatExchange\)<\/p>/g)?.length).toBe(4);
    expect(html).toContain("by Hugging Face (ML &amp; Society team)");
    expect(html).toContain("by Meri Asmita");
  });

  it("shows the effort as text with its squares, never colour alone", () => {
    for (const effort of Object.keys(EFFORT_FILLED) as Effort[]) {
      const toolsWithEffort = OPEN_TOOLS.filter((tool) => tool.effort === effort).length;
      const shown = html.match(new RegExp(`Effort: ${effort}</span>`, "g"))?.length ?? 0;
      expect(shown, `Effort: ${effort}`).toBe(toolsWithEffort);
    }
    const filledTotal = OPEN_TOOLS.reduce((sum, tool) => sum + EFFORT_FILLED[tool.effort], 0);
    expect(html.match(/ot-effort-sq on/g)?.length).toBe(filledTotal);
  });

  it("labels every card's stage chips", () => {
    expect(html.match(/aria-label="Workflow stages"/g)?.length).toBe(OPEN_TOOLS.length);
  });
});

describe("the Hindi render of the directory chrome", () => {
  const html = directoryMarkup("hi");

  it("translates the category headings and the card summaries", () => {
    expect(html).toContain("मैचिंग और हैशिंग");
    expect(html).toContain("मुफ़्त सेवाएँ (ओपन सोर्स नहीं)");
    // The card summaries come from the catalogue's summary.hi (WP150).
    const pdq = OPEN_TOOLS.find((tool) => tool.slug === "pdq")!;
    expect(html).toContain(pdq.summary.hi);
    expect(html).not.toContain(pdq.summary.en);
  });

  it("translates the chips, the maintainer line and the effort words", () => {
    expect(html.match(/class="ot-chip ot-chip-closed">ओपन सोर्स नहीं</g)?.length).toBe(3);
    expect(html.match(/class="ot-chip ot-chip-asmita">अस्मिता से</g)?.length).toBe(1);
    expect(html).toContain("Meta (ThreatExchange) द्वारा");
    expect(html).toContain("मेहनत: कम");
    expect(html).toContain("मेहनत: कोई नहीं");
  });
});

describe("the workflow strip", () => {
  it("is a filter in interactive mode: All first, five stage buttons, meanings, connectors", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowStrip, { locale: "en", active: null, onSelect: () => {} }),
    );
    expect(html.match(/aria-pressed="true"/g)).toEqual(['aria-pressed="true"']);
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(STAGE_ORDER.length);
    expect(html).toContain('role="group"');
    expect(html).toContain("Filter by workflow stage");
    expect(html.match(/class="ot-connector"/g)?.length).toBe(STAGE_ORDER.length);
    expect(html).toContain("Stop harmful content being made or uploaded.");
    expect(html).toContain("Exchange signals with other platforms and helplines.");
  });

  it("is read-only without onSelect: no buttons, only the highlighted stages marked", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowStrip, { locale: "en", highlight: ["detect", "share"] }),
    );
    expect(html).not.toMatch(/<button[\s>]/i);
    expect(html).not.toContain("aria-pressed");
    expect(html.match(/ot-stage-name is-on/g)?.length).toBe(2);
    expect(html.match(/class="ot-connector"/g)?.length).toBe(STAGE_ORDER.length - 1);
    // Not highlighted stages render without the marker class.
    expect(html).toContain("ot-stage-name\">Prevent");
  });

  it("carries the stage names from the shared i18n keys in Hindi too", () => {
    const html = renderToStaticMarkup(createElement(WorkflowStrip, { locale: "hi", highlight: ["prevent"] }));
    expect(html).toContain("रोकथाम");
    expect(html).toContain("कार्रवाई");
    expect(html.match(/ot-stage-name is-on/g)?.length).toBe(1);
  });
});

describe("the Lab hub's two section cards", () => {
  it("names Open tools and Free stacks, in that order, with the beta tools after them", () => {
    expect(LAB_HUB_SECTIONS.map((section) => section.href)).toEqual(["/lab/open-tools", "/lab/stacks"]);
    const hubSource = readFileSync(join(asmitaDir, "src", "app", "(public)", "lab", "page.tsx"), "utf8");
    expect(hubSource.indexOf("LAB_HUB_SECTIONS.map")).toBeGreaterThan(-1);
    expect(hubSource.indexOf("LAB_HUB_SECTIONS.map")).toBeLessThan(hubSource.indexOf("LAB_BETA_TOOLS.map"));
  });

  it("gives both cards a name and a line in both languages, and no beta badge key", () => {
    for (const section of LAB_HUB_SECTIONS) {
      for (const key of [section.nameKey, section.lineKey] as const) {
        expect((en as Record<string, string>)[key].trim().length, `en ${key}`).toBeGreaterThan(0);
        expect((hi as Record<string, string>)[key].trim().length, `hi ${key}`).toBeGreaterThan(0);
      }
      expect(section.nameKey).not.toBe("lab.tools.beta");
    }
    // The beta tools list itself is untouched: still the seven WP96 tools.
    expect(LAB_BETA_TOOLS).toHaveLength(7);
  });

  it("keeps the Lab routes out of the header nav, in both languages", () => {
    for (const locale of ["en", "hi"] as const) {
      const items = navGroups(locale).flatMap((group) => [group.href, ...group.items.map((item) => item.href)]);
      expect(items.filter((href) => href.startsWith("/lab"))).toEqual([]);
    }
  });
});

describe("the sitemap and the i18n dictionaries", () => {
  it("lists /lab/open-tools in the sitemap and labels it in Hindi on /sitemap", () => {
    expect(allPublicPaths).toContain("/lab/open-tools");
    const sitemapSource = readFileSync(join(asmitaDir, "src", "app", "(public)", "sitemap", "page.tsx"), "utf8");
    expect(sitemapSource).toContain('"/lab/open-tools":');
  });

  const WP151_KEYS = [
    "lab.sections.openTools.name",
    "lab.sections.openTools.line",
    "lab.sections.stacks.name",
    "lab.sections.stacks.line",
    "lab.openTools.title",
    "lab.openTools.lede",
    "lab.openTools.stacksLink",
    "lab.openTools.howLink",
    "lab.openTools.strip.label",
    "lab.openTools.stage.all",
    ...STAGE_ORDER.flatMap((stage) => [
      `lab.openTools.stage.${stage}.name`,
      `lab.openTools.stage.${stage}.meaning`,
    ]),
    "lab.openTools.audience.label",
    "lab.openTools.audience.platform",
    "lab.openTools.audience.aiApp",
    "lab.openTools.audience.ngo",
    "lab.openTools.audience.researcher",
    "lab.openTools.search.label",
    "lab.openTools.search.placeholder",
    "lab.openTools.results.countOne",
    "lab.openTools.results.countMany",
    "lab.openTools.results.none",
    "lab.openTools.results.clear",
    ...CATEGORY_ORDER.map((category) => `lab.openTools.category.${category}`),
    "lab.openTools.card.by",
    "lab.openTools.card.effort",
    "lab.openTools.card.stages",
    "lab.openTools.effort.low",
    "lab.openTools.effort.medium",
    "lab.openTools.effort.high",
    "lab.openTools.effort.none",
    "lab.openTools.chip.fromAsmita",
    "lab.openTools.chip.notOpenSource",
    "lab.openTools.suggest.title",
    "lab.openTools.suggest.body",
    "lab.openTools.suggest.cta",
    "lab.openTools.footer.names",
    "lab.openTools.footer.helpPre",
    "lab.openTools.footer.helpLink",
    // WP152 (docs/lab/open-tools-spec.md): the tool pages added their
    // chrome to the same lab.openTools.* namespace — breadcrumb, aside
    // labels, section headings, the credit cards, the code-copy buttons,
    // the English-only notice and the closing band. The exact-set contract
    // grows with the namespace; every rule below applies to them too.
    "lab.openTools.tool.breadcrumbLab",
    "lab.openTools.tool.breadcrumbLabel",
    "lab.openTools.tool.englishNotice",
    "lab.openTools.tool.atAGlance",
    "lab.openTools.tool.what",
    "lab.openTools.tool.licence",
    "lab.openTools.tool.runsOn",
    "lab.openTools.tool.stages",
    "lab.openTools.tool.links",
    "lab.openTools.tool.repository",
    "lab.openTools.tool.docs",
    "lab.openTools.tool.site",
    "lab.openTools.tool.lastChecked",
    "lab.openTools.tool.whatItDoes",
    "lab.openTools.tool.howItWorks",
    "lab.openTools.tool.whereItFits",
    "lab.openTools.tool.whatYouGet",
    "lab.openTools.tool.limits",
    "lab.openTools.tool.gettingStarted",
    "lab.openTools.tool.asmitaUse",
    "lab.openTools.tool.credit",
    "lab.openTools.tool.creditBody",
    "lab.openTools.tool.creditService",
    "lab.openTools.tool.creditAsmita",
    "lab.openTools.tool.paper",
    "lab.openTools.tool.related",
    "lab.openTools.tool.sources",
    "lab.openTools.tool.externalHint",
    "lab.openTools.tool.readDocs",
    "lab.openTools.tool.stacks.title",
    "lab.openTools.tool.stacks.none",
    "lab.openTools.tool.stacks.back",
    "lab.openTools.tool.copy",
    "lab.openTools.tool.copied",
    // WP155 (docs/lab/open-tools-spec.md): the how-we-choose page added
    // its chrome to the same lab.openTools.* namespace — title, lede and
    // the five section headings. The exact-set contract grows with the
    // namespace; every rule below applies to them too.
    "lab.openTools.how.title",
    "lab.openTools.how.lede",
    "lab.openTools.how.openMeans",
    "lab.openTools.how.weCheck",
    "lab.openTools.how.notList",
    "lab.openTools.how.suggest",
    "lab.openTools.how.credit",
  ];

  it("exists in both dictionaries, exactly this key set, non-empty", () => {
    const inDictionaries = Object.keys(en).filter((key) => key.startsWith("lab.openTools.") || key.startsWith("lab.sections."));
    expect(inDictionaries.sort()).toEqual([...WP151_KEYS].sort());
    for (const key of WP151_KEYS) {
      expect((en as Record<string, string>)[key].trim().length, `en ${key}`).toBeGreaterThan(0);
      expect((hi as Record<string, string>)[key].trim().length, `hi ${key}`).toBeGreaterThan(0);
    }
  });

  it("keeps the owner's banned marketing words and exclamation marks out", () => {
    const banned = [
      "revolutionary", "cutting-edge", "seamless", "robust", "leverage", "empower",
      "harness", "game-changer", "unlock", "state-of-the-art", "comprehensive solution",
      "in today's digital landscape",
    ];
    for (const key of WP151_KEYS) {
      for (const dictionary of [en, hi] as Record<string, string>[]) {
        const value = dictionary[key].toLowerCase();
        for (const word of banned) expect(value, `${key}: ${word}`).not.toContain(word);
        expect(dictionary[key], key).not.toContain("!");
      }
    }
  });

  it("records the new keys as machine translated in hi-review-status.json", () => {
    const status = JSON.parse(readFileSync(join(asmitaDir, "src", "i18n", "hi-review-status.json"), "utf8"));
    const keys = status.machineTranslated.keys as string[];
    expect(keys).toContain("lab.openTools.*");
    expect(keys).toContain("lab.sections.*");
    expect(status.machineTranslated.by).toContain("WP151");
  });
});
