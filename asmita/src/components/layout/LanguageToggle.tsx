"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";
import { COOKIE_BASE_NAMES } from "@/lib/cookie-names";

function saveLocale(locale: Locale) {
  document.cookie = `${COOKIE_BASE_NAMES.language}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LanguageToggle({ initialLocale: locale, label }: { initialLocale: Locale; label: string }) {
  const router = useRouter();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function switchLocale(next: Locale) {
    if (next === locale) return;
    saveLocale(next);
    router.refresh();
  }

  return (
    <div className="seg" role="group" aria-label={label}>
      {(["en", "hi"] as const).map((item) => (
        <button
          aria-pressed={locale === item}
          key={item}
          lang={item === "hi" ? "hi" : undefined}
          onClick={() => switchLocale(item)}
          type="button"
        >
          {item === "en" ? "EN" : "हिंदी"}
        </button>
      ))}
    </div>
  );
}
