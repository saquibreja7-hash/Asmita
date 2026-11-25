"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { AdminNavGroup } from "./admin-nav";

/**
 * The console's navigation: a sidebar on wide screens, and a bar with a menu
 * button on narrow ones so the page itself starts at the top.
 */
export function AdminNav({
  groups,
  actionable,
  newLinks = null,
  children,
}: {
  groups: AdminNavGroup[];
  actionable: number | null;
  /** Links survivors added to existing cases since this admin last looked. */
  newLinks?: number | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Remembering where the menu was opened closes it on the next page.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  // The console's pages also exist at their (admin) route-group paths
  // (/hashes for /admin/hashes); next.config.ts redirects those, but the
  // server render can still see the group path. Compare on the /admin form
  // so the server and the browser agree on the current entry.
  const RENAMED: Record<string, string> = { flagged: "queue", "platform-partners": "partners", "response-rates": "metrics" };
  const path = pathname.startsWith("/admin")
    ? pathname
    : `/admin${pathname.replace(/^\/([^/]+)/, (_, first: string) => `/${RENAMED[first] ?? first}`)}`;
  const matches = (href: string) =>
    href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`);
  // An entry is current on its own page and on the pages it lists in `also`.
  // The Inbox (/admin/review) is not current on the review settings and
  // reports pages that live under /admin/review/; those have entries of their own.
  const otherEntries = groups.flatMap((group) => group.items).map((item) => item.href);
  const isCurrent = (item: { href: string; also?: string[] }) => {
    if ((item.also ?? []).some(matches)) return true;
    if (!matches(item.href)) return false;
    return !otherEntries.some((href) => href !== item.href && href.startsWith(`${item.href}/`) && matches(href));
  };

  return (
    <aside aria-label="Admin navigation" className="a-side">
      <div className="a-bar">
        <Link className="a-brand" href="/admin" aria-label="Asmita console home">
          {/* The site header logo, cropped to its edges. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/asmita-logo-cropped.png" alt="" width={316} height={112} className="a-brand-logo" />
          <small>Console</small>
        </Link>
        <button
          aria-controls="admin-menu"
          aria-expanded={open}
          className="a-toggle btn btn-secondary"
          onClick={() => setOpenOn(open ? null : pathname)}
          type="button"
        >
          {open ? "Close" : "Menu"}
          {!open && (actionable || newLinks) ? <span className="a-count">{(actionable ?? 0) + (newLinks ?? 0)}</span> : null}
        </button>
      </div>
      <div className="a-menu" data-open={open} id="admin-menu">
        <nav className="a-nav">
          {groups.map((group) => (
            <div className="a-nav-group" key={group.heading ?? "home"}>
              {group.heading && <p className="a-nav-heading">{group.heading}</p>}
              {group.items.map((item) => (
                <Link
                  aria-current={isCurrent(item) ? "page" : undefined}
                  className="a-nav-link"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                  {item.href === "/admin" && actionable ? (
                    <span className="a-count">
                      {actionable}
                      <span className="sr-only"> cases waiting</span>
                    </span>
                  ) : null}
                  {item.href === "/admin/review" && newLinks ? (
                    <span className="a-count">
                      {newLinks}
                      <span className="sr-only"> new links</span>
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="a-side-foot">{children}</div>
      </div>
    </aside>
  );
}
