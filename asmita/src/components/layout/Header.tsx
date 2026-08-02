import Link from "next/link";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
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
          <Link href="/check-image">{t(locale, "nav.checkImage")}</Link>
          <Link href="/resources">{t(locale, "nav.resources")}</Link>
          <Link href="/faq">{t(locale, "nav.faq")}</Link>
          <Link href="/privacy">{t(locale, "nav.privacy")}</Link>
          <LanguageToggle initialLocale={locale} />
          <Link href="/start" className="btn btn-primary">
            {t(locale, "nav.start")}
          </Link>
        </nav>
        <div className="flex items-center gap-3 md:hidden">
          <LanguageToggle initialLocale={locale} />
          <MobileMenu locale={locale} />
        </div>
      </div>
    </header>
  );
}
