import { t, type Locale } from "@/lib/i18n";

export function SupportPanel({ locale }: { locale: Locale }) {
  return (
    <aside className="support-bar" aria-label={t(locale, "support.title")}>
      <div className="container flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-3 text-sm">
        <strong>{t(locale, "support.button")}</strong>
        <a href="tel:1098">CHILDLINE 1098</a>
        <a href="tel:112">{t(locale, "support.emergency")} 112</a>
        <a href="tel:9152987821">iCall 9152987821</a>
        <a href="/resources">{t(locale, "nav.resources")}</a>
      </div>
    </aside>
  );
}
