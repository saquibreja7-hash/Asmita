"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

const links = [
  { href: "/#issue", en: "Issue", hi: "समस्या" },
  { href: "/how-it-works", en: "Solutions", hi: "समाधान" },
  { href: "/check-image", key: "nav.checkImage" as const },
  { href: "/resources", key: "nav.resources" as const },
  { href: "/faq", key: "nav.faq" as const },
  { href: "/privacy", key: "nav.privacy" as const },
] as const;

export function MobileMenu({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
        className="btn btn-secondary !min-h-[44px] !px-2.5 !py-2"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={t(locale, "nav.menu")}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {open ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M3 6h18" />
              <path d="M3 12h18" />
              <path d="M3 18h18" />
            </>
          )}
        </svg>
      </button>
      {open && (
        <nav
          id="mobile-menu"
          className="panel absolute right-0 top-14 z-[60] grid w-64 gap-1 p-3 text-[15px] font-medium text-[var(--theme-color-2)]"
          style={{ fontFamily: "var(--font-display)" }}
          aria-label="Mobile"
        >
          {links.map((link) => {
            const label =
              "key" in link
                ? t(locale, link.key)
                : locale === "hi"
                  ? link.hi
                  : link.en;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[8px] px-3 py-2.5 hover:bg-[var(--theme-color-3)]"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            );
          })}
          <div className="mt-1 border-t border-[var(--warm-border)] pt-2">
            <Link
              href="/get-help"
              className="btn btn-primary btn-arrow w-full !m-0"
              onClick={() => setOpen(false)}
            >
              {locale === "hi" ? "मदद लें" : "Get Help"}
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
