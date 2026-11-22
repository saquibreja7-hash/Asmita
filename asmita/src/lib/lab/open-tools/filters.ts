/*
 * Pure filter and grouping helpers for the open tools directory
 * (asmita/docs/lab/open-tools-spec.md, Parts C3 and D). No React, no state:
 * the client component (WP151) passes the catalogue and the active filters
 * in, and gets the visible tools and the category groups out.
 */

import type { Audience, Category, OpenTool, Stage } from "./types";

/**
 * The category groups in the order the directory shows them (Part C3):
 * Matching and hashing; Review and rules; Detection models; Provenance;
 * Free services (not open source); From Asmita; Directories.
 */
export const CATEGORY_ORDER: readonly Category[] = [
  "matching",
  "review",
  "models",
  "provenance",
  "services",
  "asmita",
  "directories",
] as const;

/** The workflow stages in strip order; "All" is the client's own first chip. */
export const STAGE_ORDER: readonly Stage[] = [
  "prevent",
  "detect",
  "review",
  "act",
  "share",
] as const;

export const AUDIENCE_ORDER: readonly Audience[] = [
  "platform",
  "ai-app",
  "ngo",
  "researcher",
] as const;

/** Active directory filters. null or undefined means "not filtering". */
export type ToolFilters = {
  stage?: Stage | null;
  audience?: Audience | null;
  /** Free text; matches the tool's name, maintainer and tags, case-insensitively. */
  query?: string;
};

/**
 * Filter the catalogue: stage AND audience AND search combined (Part C3).
 * With no active filters every tool is returned, in catalogue order.
 */
export function filterTools(
  tools: readonly OpenTool[],
  { stage, audience, query }: ToolFilters,
): OpenTool[] {
  const needle = (query ?? "").trim().toLowerCase();
  return tools.filter((tool) => {
    if (stage != null && !tool.stages.includes(stage)) return false;
    if (audience != null && !tool.audiences.includes(audience)) return false;
    if (needle !== "") {
      const haystack =
        [tool.name, tool.maintainer, ...tool.tags].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export type ToolGroup = { category: Category; tools: OpenTool[] };

/**
 * Group tools by category in the Part C3 order. Groups with no tools are
 * dropped, so the directory can hide empty headings.
 */
export function groupByCategory(
  tools: readonly OpenTool[],
): ToolGroup[] {
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    tools: tools.filter((tool) => tool.category === category),
  }));
  return groups.filter((group) => group.tools.length > 0);
}
