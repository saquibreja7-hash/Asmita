"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

export function LanguageToggle({ initialLocale }: { initialLocale: Locale }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  // The cookie records the user's choice only. It is written from an effect
  // keyed on `choice`, which stays null until a click: an effect keyed on the
  // locale itself would also fire on mount (React StrictMode runs effects
  // twice in dev), stamping this page's own server locale over the cookie
  // while the next navigation is already under way — undoing a language
  // change made outside this component.
  const [choice, setChoice] = useState<Locale | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (choice) {
      document.cookie = `asmita_lang=${choice}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  }, [choice]);

  function switchLocale(next: Locale) {
    if (next === locale) return;
    setChoice(next);
    setLocale(next);
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
