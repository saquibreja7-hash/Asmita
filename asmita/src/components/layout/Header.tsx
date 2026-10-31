import Link from "next/link";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { t, type Locale } from "@/lib/i18n";

type NavLink =
  | { href: string; kind: "i18n"; key: Parameters<typeof t>[1] }
  | { href: string; kind: "static"; en: string; hi: string };

const navLinks: NavLink[] = [
  { href: "/issue", kind: "static", en: "Issue", hi: "समस्या" },
  { href: "/what-we-do", kind: "static", en: "What we do", hi: "हम क्या करते हैं" },
  { href: "/check-image", kind: "i18n", key: "nav.checkImage" },
  { href: "/resources", kind: "i18n", key: "nav.resources" },
  { href: "/faq", kind: "i18n", key: "nav.faq" },
];

function labelFor(locale: Locale, link: NavLink): string {
  if (link.kind === "static") return locale === "hi" ? link.hi : link.en;
  return t(locale, link.key);
}

export function Header({ locale }: { locale: Locale }) {
  const isHi = locale === "hi";
  return (
    <>
      {/* Announcement bar: the one Ink surface on the page */}
      <div className="announce">
        <div className="container flex min-h-[40px] items-center justify-between gap-4 py-1.5">
          <p className="m-0 min-w-0">
            <span className="hidden sm:inline">
              {isHi
                ? "18 से कम उम्र के हैं, या तस्वीर तब की है? अलग, सुरक्षित रास्ता है।"
                : "Under 18, or was the image taken when you were? There is a separate, safer path."}
            </span>
            <span className="sm:hidden">{isHi ? "18 से कम? सुरक्षित रास्ता है।" : "Under 18? There is a safer path."}</span>
          </p>
          <Link href="/minor-support" className="pill shrink-0">
            {isHi ? "देखें" : "Find it"}
          </Link>
        </div>
      </div>

      <header className="site-header">
        <div className="container flex min-h-[72px] items-center justify-between gap-4 md:min-h-[80px]">
          <Link href="/" className="fade flex shrink-0 items-center gap-3" aria-label="Asmita home">
            <span className="wordmark">Asmita</span>
          </Link>

          <nav className="hidden items-center lg:flex" aria-label="Primary">
            <ul className="m-0 flex list-none items-center p-0">
              {navLinks.map((link) => (
                <li key={link.href} className="m-0">
                  <Link href={link.href} className="nav-link">
                    {labelFor(locale, link)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="ml-4 flex items-center gap-3">
              <LanguageToggle initialLocale={locale} />
              <Link href="/get-help" className="btn btn-primary btn-arrow !min-h-[44px] !px-6">
                {isHi ? "मदद लें" : "Get help"}
              </Link>
            </div>
          </nav>

          <div className="flex items-center gap-2.5 lg:hidden">
            <LanguageToggle initialLocale={locale} />
            <MobileMenu locale={locale} />
          </div>
        </div>
      </header>
    </>
  );
}
