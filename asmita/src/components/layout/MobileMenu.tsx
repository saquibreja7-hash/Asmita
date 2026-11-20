"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import type { NavGroup } from "./nav-config";
import { NavItemLink, isCurrent } from "./NavLinks";

export function MobileMenu({ locale, groups }: { locale: Locale; groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Submenu groups fold open; the one holding the current page starts open.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of groups) initial[group.href] = group.items.some((item) => isCurrent(pathname, item.href));
    return initial;
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Closing by Escape or an outside tap returns focus to the menu button, so
  // keyboard users are not dropped at the top of the page.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
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
      {/* The accessible name matches the visible state: "Menu" when closed,
          the × glyph (aria-hidden) plus a visually hidden "Close menu" when
          open. No aria-label overriding the text. */}
      <button
        type="button"
        className="btn btn-secondary !min-h-[44px] !px-4"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
        ref={buttonRef}
      >
        {open ? (
          <>
            <span aria-hidden="true">×</span>
            <span className="sr-only">{t(locale, "nav.menuClose")}</span>
          </>
        ) : (
          t(locale, "nav.menu")
        )}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          className="card absolute right-0 top-14 z-[60] max-h-[75vh] w-[min(320px,calc(100vw-40px))] overflow-y-auto !p-3"
          aria-label={t(locale, "nav.mobile")}
        >
          {/* Each group folds open; the one holding the current page starts open. */}
          {groups.map((group, i) => {
            const expanded = !!openGroups[group.href];
            return (
              <div key={group.href} className="border-b border-[var(--line)] last:border-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`mobile-menu-group-${i}`}
                  className="flex w-full cursor-pointer items-center justify-between px-2 py-3 text-left text-[16px] font-semibold"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.href]: !prev[group.href] }))}
                >
                  {group.label}
                  <span
                    className={`text-[var(--text)] transition-transform ${expanded ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ⌄
                  </span>
                </button>
                <ul id={`mobile-menu-group-${i}`} className="m-0 list-none p-0 pb-2" hidden={!expanded}>
                  {group.items.map((item) => (
                    <li key={item.href + item.label}>
                      <NavItemLink item={item} className="nav-dropdown-link" onClick={() => setOpen(false)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Link
            href="/start"
            className="btn btn-primary btn-arrow mt-3 w-full"
            onClick={() => setOpen(false)}
          >
            {locale === "hi" ? "शिकायत दर्ज करें" : "File a complaint"}
          </Link>
        </nav>
      )}
    </div>
  );
}
