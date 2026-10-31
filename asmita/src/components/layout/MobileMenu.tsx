"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

const links = [
  { href: "/issue", en: "Issue", hi: "समस्या" },
  { href: "/what-we-do", en: "What we do", hi: "हम क्या करते हैं" },
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
          className="card absolute right-0 top-14 z-[60] grid w-72 gap-0 !p-4"
          aria-label="Mobile"
        >
          {links.map((link) => {
            const label =
              "key" in link ? t(locale, link.key) : locale === "hi" ? link.hi : link.en;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link border-b border-[var(--color-ash)] !px-2 last:border-0"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href="/get-help"
            className="btn btn-primary btn-arrow mt-4 w-full"
            onClick={() => setOpen(false)}
          >
            {locale === "hi" ? "मदद लें" : "Get help"}
          </Link>
        </nav>
      )}
    </div>
  );
}
