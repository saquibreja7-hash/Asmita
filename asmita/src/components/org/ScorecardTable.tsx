"use client";

import { useMemo, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import type { ScorecardPlatformRow } from "@/lib/scorecard";

// The public scorecard table (docs/org/spec.md, WP58 58.3): every column
// sorts on click (aria-sort carries the state to screen readers), the
// platform name is a row header, and a platform under the small-number
// rule shows one sentence instead of numbers. The .data-table pattern
// already collapses to a stacked layout on phones.

type SortKey =
  | "platformName"
  | "noticesSent"
  | "linkNotices"
  | "hashAdvisories"
  | "shareActioned"
  | "medianFirstResponse"
  | "medianRemoval"
  | "withinDeadline"
  | "followUps";

const NUMERIC_KEYS: SortKey[] = [
  "noticesSent",
  "linkNotices",
  "hashAdvisories",
  "shareActioned",
  "medianFirstResponse",
  "medianRemoval",
  "withinDeadline",
  "followUps",
];

type Column = { key: SortKey; labelKey: Parameters<typeof t>[1]; numeric: boolean };

const percent = (value: number | null) => (value == null ? "—" : `${Math.round(value * 100)}%`);
const hours = (value: number | null) => (value == null ? "—" : `${value} h`);

export function ScorecardTable({
  rows,
  locale,
  deadlineHours,
  caption,
}: {
  rows: ScorecardPlatformRow[];
  locale: Locale;
  deadlineHours: number;
  caption: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean } | null>(null);

  const columns: Column[] = [
    { key: "platformName", labelKey: "org.scorecard.col.platform", numeric: false },
    { key: "noticesSent", labelKey: "org.scorecard.col.notices", numeric: true },
    { key: "linkNotices", labelKey: "org.scorecard.col.linkNotices", numeric: true },
    { key: "hashAdvisories", labelKey: "org.scorecard.col.hashAdvisories", numeric: true },
    { key: "shareActioned", labelKey: "org.scorecard.col.shareActioned", numeric: true },
    { key: "medianFirstResponse", labelKey: "org.scorecard.col.medianFirstResponse", numeric: true },
    { key: "medianRemoval", labelKey: "org.scorecard.col.medianRemoval", numeric: true },
    { key: "withinDeadline", labelKey: "org.scorecard.col.withinDeadline", numeric: true },
    { key: "followUps", labelKey: "org.scorecard.col.followUps", numeric: true },
  ];

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const value = (row: ScorecardPlatformRow): number | string | null => {
      switch (sort.key) {
        case "platformName":
          return row.platformName;
        case "noticesSent":
          return row.insufficient ? null : row.noticesSent;
        case "linkNotices":
          return row.insufficient ? null : row.urlNoticesSent;
        case "hashAdvisories":
          return row.insufficient ? null : row.hashAdvisoriesSent;
        case "shareActioned":
          return row.insufficient ? null : row.shareActioned;
        case "medianFirstResponse":
          return row.insufficient ? null : row.medianHoursToFirstResponse;
        case "medianRemoval":
          return row.insufficient ? null : row.medianHoursToRemoval;
        case "withinDeadline":
          return row.insufficient ? null : row.shareActionedWithinDeadline;
        case "followUps":
          return row.insufficient ? null : row.followUpsNeeded;
      }
    };
    const compare = (a: ScorecardPlatformRow, b: ScorecardPlatformRow) => {
      const left = value(a);
      const right = value(b);
      // A row without the number this column shows (the small-number rule)
      // always sorts last, whichever way the sort points.
      if (left == null && right == null) return a.platformName.localeCompare(b.platformName);
      if (left == null) return 1;
      if (right == null) return -1;
      const result = typeof left === "string" ? left.localeCompare(right as string) : (left as number) - (right as number);
      return sort.ascending ? -result : result;
    };
    return [...rows].sort(compare);
  }, [rows, sort]);

  function toggle(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) return { key, ascending: false };
      if (!current.ascending) return { key, ascending: true };
      return null;
    });
  }

  return (
    <div className="overflow-x-auto">
      {/* No min-width: .data-table already stacks each row into a card on
          phones (globals.css, max-width 639px), and a forced width would
          stretch that stacked layout sideways. */}
      <table className="data-table w-full">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const label =
                column.key === "withinDeadline"
                  ? t(locale, column.labelKey).replace("{hours}", String(deadlineHours))
                  : t(locale, column.labelKey);
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort?.ascending ? "ascending" : "descending") : "none"}
                  className={column.numeric ? "text-right" : undefined}
                >
                  <button
                    type="button"
                    aria-label={
                      active
                        ? t(locale, "org.scorecard.sortedBy").replace("{column}", label)
                        : t(locale, "org.scorecard.sortBy").replace("{column}", label)
                    }
                    className={`text-left font-medium underline-offset-4 hover:underline ${active ? "text-[var(--brand)]" : ""} ${column.numeric ? "md:text-right" : ""}`}
                    onClick={() => toggle(column.key)}
                  >
                    {label}
                    {active ? (sort?.ascending ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.platformName}>
              <th scope="row">{row.platformName}</th>
              {row.insufficient ? (
                <td className="muted" colSpan={NUMERIC_KEYS.length}>
                  {t(locale, "org.scorecard.insufficient")}
                </td>
              ) : (
                <>
                  <td className="text-right md:text-left">{row.noticesSent}</td>
                  <td className="text-right md:text-left">{row.urlNoticesSent}</td>
                  <td className="text-right md:text-left">{row.hashAdvisoriesSent}</td>
                  <td className="text-right md:text-left">{percent(row.shareActioned)}</td>
                  <td className="text-right md:text-left">{hours(row.medianHoursToFirstResponse)}</td>
                  <td className="text-right md:text-left">{hours(row.medianHoursToRemoval)}</td>
                  <td className="text-right md:text-left">{percent(row.shareActionedWithinDeadline)}</td>
                  <td className="text-right md:text-left">{row.followUpsNeeded}</td>
                </>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="muted" colSpan={columns.length}>
                {t(locale, "org.scorecard.noPlatforms")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
