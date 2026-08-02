"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

const links = [
  { href: "/how-it-works", key: "nav.howItWorks" },
  { href: "/check-image", key: "nav.checkImage" },
  { href: "/resources", key: "nav.resources" },
  { href: "/faq", key: "nav.faq" },
  { href: "/privacy", key: "nav.privacy" },
] as const;

export function MobileMenu({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside tap or Escape. (Each link also closes the menu on click.)
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
        className="btn btn-secondary px-2.5"
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
          className="panel absolute right-0 top-14 z-30 grid w-56 gap-3 p-4 text-sm font-bold text-[var(--muted)]"
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {t(locale, link.key)}
            </Link>
          ))}
          <Link href="/start" className="btn btn-primary" onClick={() => setOpen(false)}>
            {t(locale, "nav.start")}
          </Link>
        </nav>
      )}
    </div>
  );
}
