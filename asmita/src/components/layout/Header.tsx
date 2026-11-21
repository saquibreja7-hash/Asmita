import Link from "next/link";
import { t } from "@/lib/i18n";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { NavLinks } from "@/components/layout/NavLinks";
import { navGroups } from "@/components/layout/nav-config";
import type { Locale } from "@/lib/i18n";

export function Header({ locale, scorecard = false }: { locale: Locale; scorecard?: boolean }) {
  const isHi = locale === "hi";
  const complaintLabel = isHi ? "शिकायत दर्ज करें" : "File a complaint";
  return (
    <>
      {/* Skip link: the first focusable element on the page, invisible until
          focused, so keyboard users can jump past the whole chrome to main. */}
      <a href="#main" className="skip-link">
        {t(locale, "nav.skipToMain")}
      </a>
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
            {isHi ? "कम उम्र में मदद" : "Under-18 help"}
          </Link>
        </div>
      </div>

      <header className="site-header">
        <div className="container flex min-h-[72px] items-center justify-between gap-2 md:min-h-[80px]">
          <Link href="/" className="fade flex min-w-0 items-center" aria-label={t(locale, "nav.home")}>
            {/* The logo: teal wordmark with the gold flame. A small static PNG; next/image adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/asmita-logo-teal.png" alt="Asmita" width={400} height={200} className="brand-logo" />
          </Link>

          <nav className="hidden items-center xl:flex" aria-label={t(locale, "nav.primary")}>
            <NavLinks groups={navGroups(locale, { scorecard })} />
            <div className="ml-4 flex items-center gap-3">
              <Link href="/start" className="btn btn-primary btn-arrow !min-h-[44px] !px-6">
                {complaintLabel}
              </Link>
            </div>
          </nav>

          <div className="flex shrink-0 items-center gap-2 xl:hidden">
            <MobileMenu locale={locale} groups={navGroups(locale, { scorecard })} />
            <div className="hidden md:block">
              <Link href="/start" className="btn btn-primary !min-h-[44px] !px-5">
                {complaintLabel}
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
