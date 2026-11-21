"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

function saveLocale(locale: Locale) {
  document.cookie = `asmita_lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LanguageToggle({ locale }: { locale: Locale }) {
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
    <div className="seg">
      {(["en", "hi"] as const).map((item) => (
        <button
          aria-pressed={locale === item}
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
