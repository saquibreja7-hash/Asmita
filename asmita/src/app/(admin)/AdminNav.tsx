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
  children,
}: {
  groups: AdminNavGroup[];
  actionable: number | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Remembering where the menu was opened closes it on the next page.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const isCurrent = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside aria-label="Admin navigation" className="a-side">
      <div className="a-bar">
        <Link className="a-brand" href="/admin">
          Asmita <small>Console</small>
        </Link>
        <button
          aria-controls="admin-menu"
          aria-expanded={open}
          className="a-toggle btn btn-secondary"
          onClick={() => setOpenOn(open ? null : pathname)}
          type="button"
        >
          {open ? "Close" : "Menu"}
          {!open && actionable ? <span className="a-count">{actionable}</span> : null}
        </button>
      </div>
      <div className="a-menu" data-open={open} id="admin-menu">
        <nav className="a-nav">
          {groups.map((group) => (
            <div className="a-nav-group" key={group.heading ?? "home"}>
              {group.heading && <p className="a-nav-heading">{group.heading}</p>}
              {group.items.map((item) => (
                <Link
                  aria-current={isCurrent(item.href) ? "page" : undefined}
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
