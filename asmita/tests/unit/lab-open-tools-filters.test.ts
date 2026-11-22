import { describe, expect, it } from "vitest";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import {
  AUDIENCE_ORDER,
  CATEGORY_ORDER,
  STAGE_ORDER,
  filterTools,
  groupByCategory,
} from "@/lib/lab/open-tools/filters";

// WP150 (docs/lab/open-tools-spec.md, Parts C3 and D): the directory's
// filter logic is pure. Stage AND audience AND search combine, and the
// grouping follows the spec's fixed category order. The client component
// (WP151) is a thin shell over these functions.

const bySlug = (tools: { slug: string }[]) => tools.map((tool) => tool.slug);

describe("filterTools", () => {
  it("returns every tool in catalogue order when nothing is filtered", () => {
    expect(bySlug(filterTools(OPEN_TOOLS, {}))).toEqual(bySlug([...OPEN_TOOLS]));
    expect(bySlug(filterTools(OPEN_TOOLS, { stage: null, audience: null, query: "  " }))).toEqual(
      bySlug([...OPEN_TOOLS]),
    );
  });

  it("filters by stage", () => {
    expect(bySlug(filterTools(OPEN_TOOLS, { stage: "prevent" }))).toEqual([
      "ncii-prompt-guard",
      "c2pa",
      "awesome-safety-tools",
    ]);
    expect(bySlug(filterTools(OPEN_TOOLS, { stage: "share" }))).toEqual([
      "pdq",
      "vpdq",
      "hma",
      "stopncii",
      "take-it-down",
      "asmita-fingerprint-feed",
      "awesome-safety-tools",
    ]);
  });

  it("filters by audience", () => {
    expect(bySlug(filterTools(OPEN_TOOLS, { audience: "ai-app" }))).toEqual([
      "ncii-prompt-guard",
      "gpt-oss-safeguard",
      "c2pa",
      "awesome-safety-tools",
      "roost-model-community",
    ]);
    expect(bySlug(filterTools(OPEN_TOOLS, { audience: "ngo" }))).toEqual([
      "pdq",
      "vpdq",
      "c2pa",
      "stopncii",
      "take-it-down",
      "awesome-safety-tools",
    ]);
  });

  it("combines stage and audience with AND", () => {
    expect(bySlug(filterTools(OPEN_TOOLS, { stage: "prevent", audience: "ai-app" }))).toEqual([
      "ncii-prompt-guard",
      "c2pa",
      "awesome-safety-tools",
    ]);
    expect(bySlug(filterTools(OPEN_TOOLS, { stage: "review", audience: "ngo" }))).toEqual([
      "awesome-safety-tools",
    ]);
    // A three-way combination nothing matches yields the empty list, which
    // the directory renders as "No tool matches those filters."
    expect(filterTools(OPEN_TOOLS, { stage: "act", audience: "ngo", query: "hash" })).toEqual([]);
  });

  it("searches name, maintainer and tags, case-insensitively", () => {
    expect(bySlug(filterTools(OPEN_TOOLS, { query: "PDQ" }))).toEqual([
      "pdq",
      "vpdq",
      "tmk-pdqf",
      "asmita-fingerprint-feed",
    ]);
    expect(bySlug(filterTools(OPEN_TOOLS, { query: "pdq" }))).toEqual([
      "pdq",
      "vpdq",
      "tmk-pdqf",
      "asmita-fingerprint-feed",
    ]);
    // A tag alone can find a tool the name does not mention.
    expect(bySlug(filterTools(OPEN_TOOLS, { query: "landmarks" }))).toEqual(["yunet"]);
    // A maintainer search finds the maintainer's whole family.
    expect(bySlug(filterTools(OPEN_TOOLS, { query: "ROOST" }))).toEqual([
      "coop",
      "osprey",
      "awesome-safety-tools",
      "roost-model-community",
    ]);
    expect(filterTools(OPEN_TOOLS, { query: "nothing matches this" })).toEqual([]);
  });

  it("combines search with the stage and audience filters", () => {
    const video = filterTools(OPEN_TOOLS, { stage: "detect", query: "video" });
    expect(bySlug(video)).toEqual(["vpdq", "tmk-pdqf", "gend"]);
    expect(bySlug(filterTools(OPEN_TOOLS, { audience: "researcher", query: "video" }))).toEqual([
      "vpdq",
      "tmk-pdqf",
      "gend",
    ]);
  });
});

describe("groupByCategory", () => {
  it("groups the whole catalogue in the spec's fixed order", () => {
    const groups = groupByCategory(OPEN_TOOLS);
    expect(groups.map((group) => group.category)).toEqual([
      "matching",
      "review",
      "models",
      "provenance",
      "services",
      "asmita",
      "directories",
    ]);
    expect(groups.map((group) => group.tools.length)).toEqual([5, 3, 4, 1, 2, 1, 2]);
    // Every tool appears exactly once across the groups.
    expect(groups.flatMap((group) => bySlug(group.tools)).sort()).toEqual(
      bySlug([...OPEN_TOOLS]).sort(),
    );
  });

  it("drops empty groups and survives an empty result", () => {
    const onlyProvenance = filterTools(OPEN_TOOLS, { query: "provenance" });
    expect(bySlug(onlyProvenance)).toEqual(["c2pa"]);
    expect(groupByCategory(onlyProvenance)).toEqual([{ category: "provenance", tools: onlyProvenance }]);
    expect(groupByCategory(filterTools(OPEN_TOOLS, { query: "nothing matches this" }))).toEqual([]);
  });

  it("keeps the filtered order stable inside a group", () => {
    const matching = groupByCategory(filterTools(OPEN_TOOLS, { stage: "share" }));
    expect(matching.map((group) => group.category)).toEqual(["matching", "services", "asmita", "directories"]);
    expect(bySlug(matching[0].tools)).toEqual(["pdq", "vpdq", "hma"]);
  });
});

describe("the display orders the directory needs", () => {
  it("fixes the workflow stage order and the audience chip order", () => {
    expect(STAGE_ORDER).toEqual(["prevent", "detect", "review", "act", "share"]);
    expect(AUDIENCE_ORDER).toEqual(["platform", "ai-app", "ngo", "researcher"]);
    expect(CATEGORY_ORDER).toEqual([
      "matching",
      "review",
      "models",
      "provenance",
      "services",
      "asmita",
      "directories",
    ]);
  });
});
