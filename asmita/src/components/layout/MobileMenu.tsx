"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import type { NavGroup } from "./nav-config";
import { NavItemLink, isCurrent } from "./NavLinks";

export function MobileMenu({ locale, groups }: { locale: Locale; groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-secondary !min-h-[44px] !px-4"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={t(locale, "nav.menu")}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "×" : t(locale, "nav.menu")}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          className="card absolute right-0 top-14 z-[60] max-h-[75vh] w-[min(320px,calc(100vw-40px))] overflow-y-auto !p-3"
          aria-label="Mobile"
        >
          {/* Each group folds open; the one holding the current page starts open. */}
          {groups.map((group) => (
            <details
              key={group.href}
              className="group border-b border-[var(--line)] last:border-0"
              open={group.items.some((item) => isCurrent(pathname, item.href))}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-3 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                {group.label}
                <span className="text-[var(--text)] transition-transform group-open:rotate-180" aria-hidden>⌄</span>
              </summary>
              <ul className="m-0 list-none p-0 pb-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavItemLink item={item} className="nav-dropdown-link" onClick={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <Link
            href="/get-help"
            className="btn btn-primary btn-arrow mt-3 w-full"
            onClick={() => setOpen(false)}
          >
            {locale === "hi" ? "मदद लें" : "Get help"}
          </Link>
        </nav>
      )}
    </div>
  );
}
