import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";

export type Locale = "en" | "hi";
export type MessageKey = keyof typeof en;

const dictionaries = { en, hi } satisfies Record<Locale, typeof en>;

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "hi" ? "hi" : "en";
}

export function t(locale: Locale, key: MessageKey) {
  return dictionaries[locale][key] || dictionaries.en[key];
}

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
