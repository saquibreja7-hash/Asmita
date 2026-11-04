"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavGroup, NavItem } from "./nav-config";

export function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavItemLink({ item, className, onClick }: { item: NavItem; className: string; onClick?: () => void }) {
  const pathname = usePathname();
  const current = pathname === item.href ? "page" : undefined;
  if (item.reload) {
    return <a href={item.href} className={className} aria-current={current} onClick={onClick}>{item.label}</a>;
  }
  return <Link href={item.href} className={className} aria-current={current} onClick={onClick}>{item.label}</Link>;
}

// Header nav: each group opens its pages in a dropdown on hover or keyboard
// focus. The group holding the open page stays highlighted.
export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ul className="m-0 flex list-none items-center gap-1 p-0" onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
      {groups.map((group, i) => {
        const current = group.items.some((item) => isCurrent(pathname, item.href)) || isCurrent(pathname, group.href);
        return (
          <li
            key={group.href}
            className="relative m-0"
            onMouseEnter={() => setOpen(i)}
            onMouseLeave={() => setOpen(null)}
            onFocus={() => setOpen(i)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(null);
            }}
          >
            <Link
              href={group.href}
              className="nav-link"
              data-current={current || undefined}
              aria-expanded={open === i}
              onClick={() => setOpen(null)}
            >
              {group.label}
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={`transition-transform ${open === i ? "rotate-180" : ""}`}>
                <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            {open === i && (
              // The padding bridges the gap so the pointer can travel into the panel.
              <div className="absolute left-0 top-full z-[60] pt-2">
                <ul className="nav-dropdown">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavItemLink item={item} className="nav-dropdown-link" onClick={() => setOpen(null)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
