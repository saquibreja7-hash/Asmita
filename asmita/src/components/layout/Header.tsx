import Link from "next/link";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { t, type Locale } from "@/lib/i18n";

type NavLink =
  | { href: string; kind: "i18n"; key: Parameters<typeof t>[1] }
  | { href: string; kind: "static"; en: string; hi: string };

const navLinks: NavLink[] = [
  { href: "/issue", kind: "static", en: "Issue", hi: "समस्या" },
  { href: "/how-it-works", kind: "static", en: "Solutions", hi: "समाधान" },
  { href: "/check-image", kind: "i18n", key: "nav.checkImage" },
  { href: "/resources", kind: "i18n", key: "nav.resources" },
  { href: "/faq", kind: "i18n", key: "nav.faq" },
];

function labelFor(locale: Locale, link: NavLink): string {
  if (link.kind === "static") return locale === "hi" ? link.hi : link.en;
  return t(locale, link.key);
}

export function Header({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-50 border-b border-transparent bg-white/80 backdrop-blur-md">
      <div className="container flex min-h-[72px] items-center justify-between gap-4 md:min-h-[88px]">
        {/* Left — logo */}
        <Link href="/" className="fade flex shrink-0 items-center" aria-label="Asmita home">
          <img
            src="/asmita-wordmark.png"
            alt="Asmita"
            className="h-8 w-auto md:h-[34px]"
            width={520}
            height={178}
          />
        </Link>

        {/* Center + right nav (Thorn: Red Hat Display, 15px, padding 1rem 1.5rem) */}
        <nav
          className="hidden items-center lg:flex"
          style={{ fontFamily: "var(--font-display)" }}
          aria-label="Primary"
        >
          <ul className="flex list-none items-center m-0 p-0">
            {navLinks.map((link) => (
              <li key={link.href} className="m-0">
                <Link
                  href={link.href}
                  className="block px-4 py-3 text-[15px] font-medium text-[var(--theme-color-2)] no-underline transition-opacity duration-150 hover:opacity-50 hover:no-underline"
                >
                  {labelFor(locale, link)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="ml-2 flex items-center gap-3">
            <LanguageToggle initialLocale={locale} />
            {/* Coral CTA like Thorn Donate */}
            <Link
              href="/get-help"
              className="btn btn-primary btn-arrow !m-0 !min-h-[44px] !rounded-[10px] !px-5 !text-[15px] !font-bold"
            >
              {locale === "hi" ? "मदद लें" : "Get Help"}
            </Link>
          </div>
        </nav>

        <div className="flex items-center gap-2.5 lg:hidden">
          <LanguageToggle initialLocale={locale} />
          <MobileMenu locale={locale} />
        </div>
      </div>
    </header>
  );
}
