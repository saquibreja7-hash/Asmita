"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CasePeek } from "./CasePeek";

export type CaseTableRow = {
  caseId: string;
  referenceNumber: string;
  action: string;
  due: string;
  overdue: boolean;
  links: number;
  step: string;
  platforms: string;
  age: string;
  ageTitle: string;
};

const SHORTCUTS_KEY = "asmita-admin-shortcuts";

function shortcutsOn() {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

function typingIn(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.isContentEditable;
}

/**
 * The case list's rows, a preview panel and keyboard navigation. Shortcuts
 * act only while focus is in the list or the panel, never while typing, and
 * can be switched off (WCAG 2.1.4). None of them changes a case.
 */
export function CaseTable({
  rows,
  caption,
  sortedBy,
  initialPeek,
}: {
  rows: CaseTableRow[];
  caption: string;
  sortedBy: "due" | "age-asc" | "age-desc" | null;
  initialPeek: string | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const pendingChord = useRef<number | null>(null);
  const [active, setActive] = useState(() => Math.max(0, rows.findIndex((row) => row.referenceNumber === initialPeek)));
  const [peek, setPeek] = useState<string | null>(
    initialPeek && rows.some((row) => row.referenceNumber === initialPeek) ? initialPeek : null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  // Read once on the client; the setting only shows in the help sheet.
  const [enabled, setEnabled] = useState(() => (typeof window === "undefined" ? true : shortcutsOn()));

  const syncUrl = useCallback((reference: string | null) => {
    const url = new URL(window.location.href);
    if (reference) url.searchParams.set("peek", reference);
    else url.searchParams.delete("peek");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const focusRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      setActive(index);
      rowRefs.current.get(row.caseId)?.focus();
    },
    [rows],
  );

  const openPeek = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      setActive(index);
      setPeek(row.referenceNumber);
      syncUrl(row.referenceNumber);
    },
    [rows, syncUrl],
  );

  const closePeek = useCallback(() => {
    setPeek(null);
    syncUrl(null);
    focusRow(active);
  }, [active, focusRow, syncUrl]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const inList = containerRef.current?.contains(document.activeElement) ?? false;
      const inPanel = panelRef.current?.contains(document.activeElement) ?? false;
      if (!inList && !inPanel) return;
      if (typingIn(event.target)) return;

      // Not character keys: always on.
      if (event.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (peek) closePeek();
        return;
      }
      if (!enabled) return;

      if (pendingChord.current !== null) {
        window.clearTimeout(pendingChord.current);
        pendingChord.current = null;
        const target = { h: "/admin", c: "/admin/cases", q: "/admin/queue" }[event.key];
        if (target) {
          event.preventDefault();
          router.push(target);
        }
        return;
      }

      switch (event.key) {
        case "j":
        case "k": {
          event.preventDefault();
          const next = Math.min(rows.length - 1, Math.max(0, active + (event.key === "j" ? 1 : -1)));
          if (peek) openPeek(next);
          focusRow(next);
          break;
        }
        case "o":
          event.preventDefault();
          if (rows[active]) router.push(`/admin/cases/${rows[active].referenceNumber}`);
          break;
        case "/":
          event.preventDefault();
          document.getElementById("q")?.focus();
          break;
        case "?":
          event.preventDefault();
          setHelpOpen((open) => !open);
          break;
        case "g":
          pendingChord.current = window.setTimeout(() => {
            pendingChord.current = null;
          }, 1200);
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, closePeek, enabled, focusRow, helpOpen, openPeek, peek, router, rows]);

  function setShortcuts(on: boolean) {
    setEnabled(on);
    try {
      window.localStorage.setItem(SHORTCUTS_KEY, on ? "on" : "off");
    } catch {
      // Storage can be blocked; the choice then lasts for this page only.
    }
  }

  const ariaSort = (column: "due" | "age") =>
    column === "due"
      ? sortedBy === "due"
        ? "ascending"
        : undefined
      : sortedBy === "age-asc"
        ? "ascending"
        : sortedBy === "age-desc"
          ? "descending"
          : undefined;

  return (
    <div>
      <div className="mb-2 hidden justify-end md:flex">
        <button
          aria-expanded={helpOpen}
          className="link-underline text-xs"
          onClick={() => setHelpOpen((open) => !open)}
          type="button"
        >
          Keyboard shortcuts
        </button>
      </div>
      {helpOpen && (
        <ShortcutHelp enabled={enabled} onClose={() => setHelpOpen(false)} onToggle={setShortcuts} />
      )}

      <div
        className="a-card overflow-x-auto"
        ref={containerRef}
      >
        <table className="a-table hidden md:table" data-compact={Boolean(peek)}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <Th>Reference</Th>
              <Th>Next action</Th>
              <Th sort={ariaSort("due")}>Due</Th>
              <Th extra>Links</Th>
              <Th extra>Step</Th>
              <Th extra>Platforms</Th>
              <Th extra sort={ariaSort("age")}>
                Age
              </Th>
              <Th>
                <span className="sr-only">Preview</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                className="cursor-pointer outline-none"
                data-selected={peek === row.referenceNumber}
                key={row.caseId}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a,button")) return;
                  openPeek(index);
                }}
                onFocus={() => setActive(index)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || (enabled && event.key === " ")) {
                    event.preventDefault();
                    openPeek(index);
                  }
                }}
                ref={(element) => {
                  if (element) rowRefs.current.set(row.caseId, element);
                  else rowRefs.current.delete(row.caseId);
                }}
                tabIndex={index === active ? 0 : -1}
              >
                <td className="a-nowrap">
                  <Link className="link-underline font-mono" href={`/admin/cases/${row.referenceNumber}`} tabIndex={-1}>
                    {row.referenceNumber}
                  </Link>
                </td>
                <td className="font-medium">{row.action}</td>
                <td className={`a-nowrap tabular-nums ${row.overdue ? "font-semibold text-[var(--danger)]" : ""}`}>
                  {row.overdue && <span aria-hidden="true">! </span>}
                  {row.due}
                </td>
                <td className="a-extra tabular-nums">{row.links}</td>
                <td className="a-extra a-nowrap">{row.step}</td>
                <td className="a-extra">{row.platforms}</td>
                <td className="a-extra a-nowrap tabular-nums text-[var(--text-muted)]" title={row.ageTitle}>
                  {row.age}
                </td>
                <td className="a-nowrap text-right">
                  <button className="link-underline text-xs" onClick={() => openPeek(index)} tabIndex={-1} type="button">
                    Preview
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-[var(--line)] md:hidden">
          {rows.map((row, index) => (
            <li className="grid gap-1 p-4" key={row.caseId}>
              <div className="flex items-baseline justify-between gap-2">
                <Link className="link-underline font-mono" href={`/admin/cases/${row.referenceNumber}`}>
                  {row.referenceNumber}
                </Link>
                <button className="link-underline text-xs" onClick={() => openPeek(index)} type="button">
                  Preview
                </button>
              </div>
              <p className="font-medium">{row.action}</p>
              <p className={row.overdue ? "font-semibold text-[var(--danger)]" : "muted"}>
                {row.overdue && <span aria-hidden="true">! </span>}
                {row.due}
              </p>
              <p className="muted text-xs">
                {[`${row.links} link${row.links === 1 ? "" : "s"}`, row.platforms, row.step, `${row.age} old`]
                  .filter((part) => part !== "-")
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {peek && <CasePeek key={peek} onClose={closePeek} panelRef={panelRef} reference={peek} />}
    </div>
  );
}

function ShortcutHelp({
  enabled,
  onToggle,
  onClose,
}: {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const rows: Array<[string, string]> = [
    ["j / k", "Next or previous case (moves the preview too)"],
    ["Enter or Space", "Preview the case"],
    ["o", "Open the full case page"],
    ["Esc", "Close the preview"],
    ["/", "Search by reference"],
    ["g then h, c or q", "Go to Needs action, Cases or Flagged links"],
    ["?", "Show or hide this list"],
  ];
  return (
    <section
      aria-label="Keyboard shortcuts"
      className="a-card mb-4 p-4"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base">Keyboard shortcuts</h2>
        <button className="link-underline text-xs" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <p className="muted mt-2 text-xs">
        They work while the case list or preview has focus, never while you type, and none of them changes a case.
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {rows.map(([keys, action]) => (
          <div className="contents" key={keys}>
            <dt className="font-mono text-xs">{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <label className="mt-4 flex items-center gap-2">
        <input checked={enabled} onChange={(event) => onToggle(event.target.checked)} type="checkbox" />
        Single-key shortcuts on
      </label>
    </section>
  );
}

function Th({
  children,
  sort,
  extra,
}: {
  children: React.ReactNode;
  sort?: "ascending" | "descending";
  /** A column that gives way while the preview panel is open. */
  extra?: boolean;
}) {
  return (
    <th aria-sort={sort} className={extra ? "eyebrow a-extra" : "eyebrow"} scope="col">
      {children}
    </th>
  );
}
