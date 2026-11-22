"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import type { Audience, Category, OpenTool, Stage } from "@/lib/lab/open-tools/types";
import { AUDIENCE_ORDER, filterTools, groupByCategory } from "@/lib/lab/open-tools/filters";
import { WorkflowStrip } from "./WorkflowStrip";
import { OpenToolCard } from "./OpenToolCard";

/*
 * The open tools directory's interactive half (docs/lab/open-tools-spec.md,
 * Part C3): the workflow strip, the "I am…" chips, the search box and the
 * grouped results. The filtering itself is the pure functions from
 * src/lib/lab/open-tools/filters.ts; this component only holds the state.
 *
 * Without JavaScript the server-rendered markup is the whole page: all 18
 * cards in their category groups, no filter controls — the strip, chips and
 * search appear only after hydration, so they never strand a no-JS visitor
 * with controls that do nothing and cards that cannot be filtered.
 */

const AUDIENCE_KEY: Record<Audience, MessageKey> = {
  platform: "lab.openTools.audience.platform",
  "ai-app": "lab.openTools.audience.aiApp",
  ngo: "lab.openTools.audience.ngo",
  researcher: "lab.openTools.audience.researcher",
};

const CATEGORY_KEY: Record<Category, MessageKey> = {
  matching: "lab.openTools.category.matching",
  review: "lab.openTools.category.review",
  models: "lab.openTools.category.models",
  provenance: "lab.openTools.category.provenance",
  services: "lab.openTools.category.services",
  asmita: "lab.openTools.category.asmita",
  directories: "lab.openTools.category.directories",
};

const noSubscribe = () => () => {};

export function OpenToolsDirectory({ tools, locale }: { tools: readonly OpenTool[]; locale: Locale }) {
  // The filter UI renders only after hydration (see the comment above):
  // false on the server and on the first client render, true after that.
  // The same hydration gate pattern as components/ReadingTime.tsx.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [stage, setStage] = useState<Stage | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => filterTools(tools, { stage, audience, query }),
    [tools, stage, audience, query],
  );
  const groups = useMemo(() => groupByCategory(visible), [visible]);

  const clearFilters = () => {
    setStage(null);
    setAudience(null);
    setQuery("");
  };

  const countText = (count: number) =>
    t(locale, count === 1 ? "lab.openTools.results.countOne" : "lab.openTools.results.countMany").replace(
      "{count}",
      String(count),
    );

  return (
    <div>
      {mounted && (
        <div className="ot-strip-band">
          <div className="container">
            <WorkflowStrip locale={locale} active={stage} onSelect={setStage} />
          </div>
        </div>
      )}

      <div className="container">
        {mounted && (
          <div className="ot-filters">
            <div className="ot-filter-row" role="group" aria-label={t(locale, "lab.openTools.audience.label")}>
              <span className="ot-filter-label">{t(locale, "lab.openTools.audience.label")}</span>
              {AUDIENCE_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="ot-chip"
                  aria-pressed={audience === value}
                  onClick={() => setAudience(audience === value ? null : value)}
                >
                  {t(locale, AUDIENCE_KEY[value])}
                </button>
              ))}
            </div>

            <div className="ot-search">
              <label htmlFor="ot-search-input">{t(locale, "lab.openTools.search.label")}</label>
              <input
                id="ot-search-input"
                type="search"
                className="input"
                placeholder={t(locale, "lab.openTools.search.placeholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <p className="ot-count" role="status">
              {countText(visible.length)}
            </p>

            {groups.length === 0 && (
              <div className="ot-empty">
                <p>{t(locale, "lab.openTools.results.none")}</p>
                <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                  {t(locale, "lab.openTools.results.clear")}
                </button>
              </div>
            )}
          </div>
        )}

        {groups.map((group) => (
          <section key={group.category} className="ot-group" aria-labelledby={`ot-group-${group.category}`}>
            <h2 id={`ot-group-${group.category}`} className="section-title">
              {t(locale, CATEGORY_KEY[group.category])}
            </h2>
            <div className="ot-grid">
              {group.tools.map((tool) => (
                <OpenToolCard key={tool.slug} tool={tool} locale={locale} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
