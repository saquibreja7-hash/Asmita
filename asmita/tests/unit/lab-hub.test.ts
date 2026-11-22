import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { navGroups } from "@/components/layout/nav-config";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import { allPublicPaths, siteMap } from "@/lib/site-map";
import { LAB_BETA_TOOLS, LAB_HUB_KEYS } from "@/lib/lab/beta-tools";

// WP96 (docs/lab/beta-spec.md): the Lab hub links every beta tool, every
// tool route sits in the sitemap, and none of them enters the main header
// nav. The hub renders from LAB_BETA_TOOLS (src/lib/lab/beta-tools.ts), the
// sitemap from allPublicPaths (src/lib/site-map.ts) and the header from
// navGroups (src/components/layout/nav-config.ts) — so those three contracts
// are checked against each other here, where a drift fails loudly instead
// of silently unlinking a tool.

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));

const SPEC_TOOLS = [
  "/lab/trace",
  "/lab/detectors",
  "/lab/protect",
  "/lab/tracker",
  "/lab/message-check",
  "/lab/stamp",
  "/lab/spot-the-fake",
] as const;

describe("the Lab hub's beta tools list", () => {
  it("is exactly the spec's seven tools, in the spec's order", () => {
    expect(LAB_BETA_TOOLS.map((tool) => tool.href)).toEqual([...SPEC_TOOLS]);
  });

  it("names every tool route exactly once", () => {
    const hrefs = LAB_BETA_TOOLS.map((tool) => tool.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/lab/")).toBe(true);
  });

  it("has a page file behind every tool route", () => {
    for (const tool of LAB_BETA_TOOLS) {
      const page = join(asmitaDir, "src", "app", "(public)", `${tool.href.slice(1)}`, "page.tsx");
      expect(existsSync(page), `${tool.href} has no page.tsx`).toBe(true);
    }
  });
});

describe("the hub's strings", () => {
  it("carry the Beta badge wording the spec requires, in both languages", () => {
    expect(en[LAB_HUB_KEYS.beta]).toBe("Beta: experimental");
    expect(hi[LAB_HUB_KEYS.beta].trim().length).toBeGreaterThan(0);
  });

  it("exist, non-empty, in both en.json and hi.json", () => {
    const keys: (keyof typeof en)[] = [LAB_HUB_KEYS.title, LAB_HUB_KEYS.note, LAB_HUB_KEYS.beta];
    for (const tool of LAB_BETA_TOOLS) {
      keys.push(tool.nameKey, tool.lineKey);
    }
    for (const key of keys) {
      expect(en[key].trim().length, `en.json ${key}`).toBeGreaterThan(0);
      expect(hi[key].trim().length, `hi.json ${key}`).toBeGreaterThan(0);
    }
  });

  it("give every card a name and a one-line description, not a paragraph", () => {
    for (const tool of LAB_BETA_TOOLS) {
      const name = en[tool.nameKey];
      const line = en[tool.lineKey];
      expect(name.length).toBeGreaterThan(2);
      expect(name.length).toBeLessThanOrEqual(40);
      expect(line.length).toBeGreaterThan(10);
      expect(line.length).toBeLessThanOrEqual(200);
      expect(line.endsWith(".")).toBe(true);
    }
  });
});

describe("WP96's sitemap and header-nav contract", () => {
  it("every tool route, and the hub itself, is in the sitemap", () => {
    for (const href of ["/lab", ...SPEC_TOOLS]) {
      expect(allPublicPaths, `${href} missing from the sitemap`).toContain(href);
    }
  });

  it("no Lab route is in the main header nav, in either language", () => {
    for (const locale of ["en", "hi"] as const) {
      const items = navGroups(locale).flatMap((group) => [group.href, ...group.items.map((item) => item.href)]);
      const labRoutes = items.filter((href) => href === "/lab" || href.startsWith("/lab/"));
      expect(labRoutes, `${locale} nav has Lab routes`).toEqual([]);
    }
  });
});

describe("the human /sitemap page with the Lab routes", () => {
  // The page renders siteMap's groups with a positionally-indexed Hindi
  // title array (groupTitlesHi), so inserting a group silently misaligns
  // every later Hindi title unless the array grows with it.
  const source = readFileSync(join(asmitaDir, "src", "app", "(public)", "sitemap", "page.tsx"), "utf8");

  it("keeps its Hindi group titles aligned with the sitemap groups", () => {
    const titles = source.match(/groupTitlesHi = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    const count = (titles.match(/"/g) ?? []).length / 2;
    expect(count).toBe(siteMap.length);
  });

  it("labels every Lab route in Hindi", () => {
    for (const href of ["/lab", ...SPEC_TOOLS]) {
      expect(source, `${href} has no Hindi label`).toContain(`"${href}":`);
    }
  });
});
