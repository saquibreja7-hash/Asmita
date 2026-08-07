"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

export function LanguageToggle({ initialLocale }: { initialLocale: Locale }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.cookie = `asmita_lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = locale;
  }, [locale]);

  function switchLocale(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    router.refresh();
  }

  return (
    <div className="flex rounded-[8px] border border-[var(--warm-border)] bg-white p-0.5 text-xs font-semibold">
      {(["en", "hi"] as const).map((item) => (
        <button
          aria-pressed={locale === item}
          className={`rounded-[6px] px-2.5 py-1.5 transition-colors ${
            locale === item
              ? "bg-[var(--mint)] text-[var(--theme-color-2)]"
              : "text-[var(--muted)]"
          }`}
          key={item}
          onClick={() => switchLocale(item)}
          type="button"
        >
          {item === "en" ? "EN" : "हिंदी"}
        </button>
      ))}
    </div>
  );
}
