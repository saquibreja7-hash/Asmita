"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { COOKIE_BASE_NAMES } from "@/lib/cookie-names";

const LANGUAGES: { code: Locale; name: string; english: string }[] = [
  { code: "en", name: "English", english: "English" },
  { code: "hi", name: "हिंदी", english: "Hindi" },
];

function saveLocale(locale: Locale) {
  document.cookie = `${COOKIE_BASE_NAMES.language}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// The footer's language control: one button showing the current language,
// which opens a drawer (a native modal <dialog>: focus stays inside, Escape
// closes it, focus returns to the button) listing the languages.
export function LanguageDrawer({ initialLocale, label }: { initialLocale: Locale; label: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  // The cookie records the user's choice only, written from an effect keyed
  // on `choice` (null until a pick), so a mount never overwrites a language
  // chosen elsewhere.
  const [choice, setChoice] = useState<Locale | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (choice) saveLocale(choice);
  }, [choice]);

  const isHi = locale === "hi";
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  const title = isHi ? "भाषा चुनें" : "Choose language";

  function pick(next: Locale) {
    dialogRef.current?.close();
    if (next === locale) return;
    setChoice(next);
    setLocale(next);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="lang-button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        <span className="sr-only">{label}: </span>
        <span lang={current.code}>{current.name}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="lang-drawer"
        aria-labelledby="lang-drawer-title"
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="lang-drawer-panel">
          <div className="lang-drawer-head">
            <h2 id="lang-drawer-title" className="lang-drawer-title">{title}</h2>
            <button type="button" className="lang-drawer-close" onClick={() => dialogRef.current?.close()}>
              <span className="sr-only">{isHi ? "बंद करें" : "Close"}</span>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <ul className="lang-drawer-list">
            {LANGUAGES.map((lang) => (
              <li key={lang.code}>
                <button
                  type="button"
                  className="lang-drawer-option"
                  aria-current={lang.code === locale ? "true" : undefined}
                  onClick={() => pick(lang.code)}
                >
                  <span lang={lang.code}>{lang.name}</span>
                  {lang.code !== "en" && <span className="lang-drawer-sub">{lang.english}</span>}
                  {lang.code === locale && (
                    <svg aria-hidden="true" className="lang-drawer-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
