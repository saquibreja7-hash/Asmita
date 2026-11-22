import { describe, expect, it } from "vitest";
import { OPEN_TOOLS, getOpenTool } from "@/lib/lab/open-tools/catalogue";

// WP150 (docs/lab/open-tools-spec.md): validate the catalogue against the
// spec's Part D rules. Every tool's facts come from the spec's checked facts
// or the tool's own official sources (recorded per tool in the `sources`
// list and in asmita/docs/lab/open-tools-sources.md); these tests hold the
// catalogue to the spec's shape, honesty and style rules so a bad edit
// fails loudly instead of reaching a page.

const SPEC_SLUGS = [
  "pdq",
  "vpdq",
  "tmk-pdqf",
  "hma",
  "sscd",
  "coop",
  "osprey",
  "altitude",
  "ncii-prompt-guard",
  "gpt-oss-safeguard",
  "gend",
  "yunet",
  "c2pa",
  "stopncii",
  "take-it-down",
  "asmita-fingerprint-feed",
  "awesome-safety-tools",
  "roost-model-community",
] as const;

// Part A4's banned marketing words, checked case-insensitively as words or
// phrases, plus the spec's other style rules (no exclamation marks).
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

const STAGES = ["prevent", "detect", "review", "act", "share"] as const;
const AUDIENCES = ["platform", "ai-app", "ngo", "researcher"] as const;
const EFFORTS = ["low", "medium", "high", "none"] as const;
const DIAGRAMS = ["hash", "similarity", "review", "classifier", "provenance", "none"] as const;

// The tools Part D gives an asmitaUse paragraph for; every other tool must
// omit the section entirely (the spec forbids "we don't use it" filler).
const EXPECTED_ASMITA_USE = new Set(["pdq", "vpdq", "hma", "sscd", "gend", "c2pa"]);

// Part C4: which reusable diagram each tool uses.
const EXPECTED_DIAGRAMS: Record<string, string> = {
  pdq: "hash",
  vpdq: "hash",
  "tmk-pdqf": "hash",
  hma: "hash",
  sscd: "similarity",
  coop: "review",
  osprey: "review",
  altitude: "review",
  "ncii-prompt-guard": "classifier",
  "gpt-oss-safeguard": "classifier",
  gend: "classifier",
  yunet: "classifier",
  c2pa: "provenance",
  stopncii: "hash",
  "take-it-down": "hash",
  "asmita-fingerprint-feed": "hash",
  "awesome-safety-tools": "none",
  "roost-model-community": "none",
};

function collectStrings(value: unknown, path: string, visit: (s: string, path: string) => void): void {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, visit));
  else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(child, `${path}.${key}`, visit);
    }
  }
}

function toolStrings(tool: Record<string, unknown>): { text: string; path: string }[] {
  const out: { text: string; path: string }[] = [];
  collectStrings(tool, "tool", (text, path) => out.push({ text, path }));
  return out;
}

/** Every URL: https everywhere, except internal site paths ("/for-platforms"). */
function assertLink(value: string, label: string): void {
  expect(value.startsWith("https://") || value.startsWith("/"), label).toBe(true);
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("the open tools catalogue", () => {
  it("is exactly the spec's 18 tools, in the spec's order", () => {
    expect(OPEN_TOOLS.map((tool) => tool.slug)).toEqual([...SPEC_SLUGS]);
  });

  it("has unique slugs and a working lookup", () => {
    const slugs = OPEN_TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(getOpenTool(slug)?.slug, slug).toBe(slug);
    }
    expect(getOpenTool("no-such-tool")).toBeUndefined();
  });
});

describe("each tool entry (Part D validation list)", () => {
  for (const tool of OPEN_TOOLS) {
    describe(tool.slug, () => {
      it("has every required field present and non-empty", () => {
        for (const field of [
          "name",
          "maintainer",
          "maintainerUrl",
          "kind",
          "licence",
          "licenceUrl",
          "runsOn",
          "effortNote",
        ] as const) {
          expect((tool[field] as string).trim().length > 0, `${tool.slug}.${field}`).toBe(true);
        }
        expect(tool.summary.en.trim().length).toBeGreaterThan(0);
        expect(tool.summary.hi.trim().length).toBeGreaterThan(0);
        for (const field of ["stages", "audiences", "tags", "whatItDoes", "howItWorks", "fitsWhere", "features", "limits", "gettingStarted", "related", "sources"] as const) {
          expect((tool[field] as unknown[]).length, `${tool.slug}.${field}`).toBeGreaterThan(0);
        }
      });

      it("keeps the section sizes inside the spec's ranges", () => {
        expect(tool.whatItDoes.length).toBeGreaterThanOrEqual(2);
        expect(tool.whatItDoes.length).toBeLessThanOrEqual(3);
        expect(tool.howItWorks.length).toBeGreaterThanOrEqual(3);
        expect(tool.howItWorks.length).toBeLessThanOrEqual(6);
        expect(tool.fitsWhere.length).toBeGreaterThanOrEqual(2);
        expect(tool.fitsWhere.length).toBeLessThanOrEqual(4);
        expect(tool.features.length).toBeGreaterThanOrEqual(4);
        expect(tool.features.length).toBeLessThanOrEqual(8);
        expect(tool.limits.length).toBeGreaterThanOrEqual(2);
        expect(tool.limits.length).toBeLessThanOrEqual(6);
        expect(tool.gettingStarted.length).toBeGreaterThanOrEqual(1);
      });

      it("summarises in at most 22 words (English) and carries a Hindi summary", () => {
        expect(words(tool.summary.en)).toBeLessThanOrEqual(22);
        expect(tool.summary.hi.trim().length).toBeGreaterThan(0);
      });

      it("has non-empty limits and non-empty getting-started steps", () => {
        expect(tool.limits.length).toBeGreaterThan(0);
        for (const step of tool.gettingStarted) {
          expect(step.step.trim().length).toBeGreaterThan(0);
        }
      });

      it("references only existing related tools, at most three, never itself", () => {
        expect(tool.related.length).toBeLessThanOrEqual(3);
        for (const slug of tool.related) {
          expect(getOpenTool(slug), `${tool.slug} relates to unknown ${slug}`).toBeDefined();
        }
        expect(tool.related).not.toContain(tool.slug);
      });

      it("uses https URLs (internal site paths allowed) and lists repo and docs in sources", () => {
        assertLink(tool.maintainerUrl, `${tool.slug}.maintainerUrl`);
        assertLink(tool.licenceUrl, `${tool.slug}.licenceUrl`);
        for (const source of tool.sources) assertLink(source, `${tool.slug}.sources`);
        if (tool.repoUrl) {
          assertLink(tool.repoUrl, `${tool.slug}.repoUrl`);
          expect(tool.sources).toContain(tool.repoUrl);
        }
        if (tool.docsUrl) {
          assertLink(tool.docsUrl, `${tool.slug}.docsUrl`);
          expect(tool.sources).toContain(tool.docsUrl);
        }
      });

      it("has non-empty sources and an ISO checkedAt date", () => {
        expect(tool.sources.length).toBeGreaterThan(0);
        expect(tool.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("carries no banned marketing word and no exclamation mark", () => {
        for (const { text, path } of toolStrings(tool as unknown as Record<string, unknown>)) {
          const lower = text.toLowerCase();
          for (const banned of BANNED_WORDS) {
            expect(lower.includes(banned), `${path} contains "${banned}"`).toBe(false);
          }
          // A code snippet may legitimately carry an exclamation mark; prose may not.
          if (!path.includes(".code")) {
            expect(text.includes("!"), `${path} contains "!"`).toBe(false);
          }
        }
      });

      it("uses valid stages, audiences and effort", () => {
        expect(tool.stages.length).toBeGreaterThan(0);
        expect(new Set(tool.stages).size).toBe(tool.stages.length);
        for (const stage of tool.stages) expect(STAGES).toContain(stage);
        expect(tool.audiences.length).toBeGreaterThan(0);
        expect(new Set(tool.audiences).size).toBe(tool.audiences.length);
        for (const audience of tool.audiences) expect(AUDIENCES).toContain(audience);
        expect(EFFORTS).toContain(tool.effort);
        expect(DIAGRAMS).toContain(tool.diagram);
      });

      it("carries the diagram the spec assigns it", () => {
        expect(tool.diagram).toBe(EXPECTED_DIAGRAMS[tool.slug]);
      });

      it("marks only the free services and the partner feed as not open source", () => {
        if (!tool.openSource) {
          expect(["services", "asmita"]).toContain(tool.category);
        }
      });
    });
  }

  it("marks exactly the Asmita feed as fromAsmita, in the asmita category", () => {
    const asmitaTools = OPEN_TOOLS.filter((tool) => tool.fromAsmita);
    expect(asmitaTools.map((tool) => tool.slug)).toEqual(["asmita-fingerprint-feed"]);
    expect(asmitaTools[0].category).toBe("asmita");
  });

  it("has an asmitaUse paragraph exactly where the spec gives one", () => {
    const withUse = OPEN_TOOLS.filter((tool) => tool.asmitaUse !== undefined).map((tool) => tool.slug);
    expect(withUse).toEqual([...EXPECTED_ASMITA_USE]);
    for (const tool of OPEN_TOOLS) {
      if (tool.asmitaUse !== undefined) expect(tool.asmitaUse.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps each tool's English prose between 250 and 850 words (the page budget is 350 to 900)", () => {
    for (const tool of OPEN_TOOLS) {
      const prose = [
        tool.summary.en,
        ...tool.whatItDoes,
        ...tool.howItWorks,
        ...tool.fitsWhere,
        ...tool.features,
        ...tool.limits,
        ...tool.gettingStarted.map((step) => step.step),
        ...(tool.asmitaUse ? [tool.asmitaUse] : []),
      ].join(" ");
      const count = words(prose);
      expect(count, `${tool.slug} prose is ${count} words`).toBeGreaterThanOrEqual(250);
      expect(count, `${tool.slug} prose is ${count} words`).toBeLessThanOrEqual(850);
    }
  });
});
