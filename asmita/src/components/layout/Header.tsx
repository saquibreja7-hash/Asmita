import Link from "next/link";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { t, type Locale } from "@/lib/i18n";

export function Header({ locale }: { locale: Locale }) {
  return (
    <header className="border-b border-[var(--border)] bg-white/90 backdrop-blur">
      <div className="container flex min-h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center">
          <img
            src="/asmita-wordmark.png"
            alt="Asmita"
            className="h-8 w-auto"
            width={520}
            height={178}
          />
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-[var(--muted)] md:flex">
          <Link href="/how-it-works">{t(locale, "nav.howItWorks")}</Link>
          <Link href="/resources">{t(locale, "nav.resources")}</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/privacy">{t(locale, "nav.privacy")}</Link>
          <LanguageToggle initialLocale={locale} />
          <Link href="/start" className="btn btn-primary">
            {t(locale, "nav.start")}
          </Link>
        </nav>
        <div className="flex items-center gap-3 md:hidden">
          <LanguageToggle initialLocale={locale} />
          <details className="relative">
            <summary className="btn btn-secondary list-none">Menu</summary>
            <nav className="panel absolute right-0 top-14 z-30 grid w-56 gap-3 p-4 text-sm font-bold text-[var(--muted)]">
              <Link href="/how-it-works">{t(locale, "nav.howItWorks")}</Link>
              <Link href="/resources">{t(locale, "nav.resources")}</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/privacy">{t(locale, "nav.privacy")}</Link>
              <Link href="/start" className="btn btn-primary">
                {t(locale, "nav.start")}
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
