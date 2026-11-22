import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { HELPLINE } from "@/lib/helpline";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { NewsletterInlineForm } from "@/components/org/NewsletterInlineForm";

// Public uptime page (Better Stack), outside the app so it stays up when the site is down.
export const STATUS_URL = "https://status.meriasmita.org";

export function Footer({ locale, withoutNewsletter = false }: { locale: Locale; withoutNewsletter?: boolean }) {
  const isHi = locale === "hi";

  // Brand plus three link columns, matching the grid in site-styles.css.
  // Privacy, sitemap and status sit in the bottom bar.
  const columns = isHi
    ? [
        {
          title: "मदद",
          links: [
            { href: "/start", label: "मदद लें" },
            { href: "/minor-support", label: "18 से कम?" },
            { href: "/resources", label: "संसाधन" },
            { href: "/faq", label: "सामान्य प्रश्न" },
          ],
        },
        {
          title: "समस्या",
          links: [
            { href: "/issue", label: "छवि-आधारित दुर्व्यवहार" },
            { href: "/check-image", label: "AI से बनी तस्वीर की रिपोर्ट" },
            { href: "/how-it-works", label: "यह कैसे काम करता है" },
            { href: "/policy", label: "नीति और पैरवी" },
            { href: "/research", label: "शोध" },
            { href: "/lab", label: "AI लैब" },
          ],
        },
        {
          title: "संगठन",
          links: [
            { href: "/about", label: "हमारे बारे में" },
            { href: "/get-involved", label: "जुड़िए" },
            { href: "/partners", label: "साझेदारी कीजिए" },
            { href: "/for-platforms", label: "प्लेटफ़ॉर्म के लिए" },
            { href: "/careers", label: "करियर" },
            { href: "/news", label: "समाचार" },
            { href: "/contact", label: "संपर्क" },
          ],
        },
      ]
    : [
        {
          title: "Get Help",
          links: [
            { href: "/start", label: "Start a case" },
            { href: "/get-help", label: "What to do" },
            { href: "/minor-support", label: "Under 18" },
            { href: "/resources", label: "Resources" },
            { href: "/faq", label: "FAQ" },
          ],
        },
        {
          title: "The Issue",
          links: [
            { href: "/issue", label: "Image-based abuse" },
            { href: "/issue/deepfakes", label: "Deepfakes and AI" },
            { href: "/who-we-help", label: "Who we help" },
            { href: "/glossary", label: "Glossary" },
            { href: "/policy", label: "Policy and advocacy" },
            { href: "/research", label: "Research" },
            { href: "/lab", label: "AI Lab" },
          ],
        },
        {
          title: "Organization",
          links: [
            { href: "/about", label: "Who we are" },
            { href: "/what-we-do", label: "What we do" },
            { href: "/get-involved", label: "Get involved" },
            { href: "/partners", label: "Partner with us" },
            { href: "/for-platforms", label: "For platforms" },
            { href: "/careers", label: "Careers" },
            { href: "/news", label: "News" },
            { href: "/contact", label: "Contact" },
          ],
        },
      ];

  const utilityLinks = isHi
    ? [
        { href: "/privacy", label: "गोपनीयता" },
        { href: "/legal", label: "कानूनी" },
        { href: "/sitemap", label: "साइटमैप" },
        // English until a native speaker supplies the Hindi label.
        { href: STATUS_URL, label: "Status" },
      ]
    : [
        { href: "/privacy", label: "Privacy" },
        { href: "/sitemap", label: "Sitemap" },
        { href: STATUS_URL, label: "Status" },
      ];

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-wrap">
        {/* Thorn-style: logo left, multi-col nav, helpline rightish */}
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-logo-link" aria-label={t(locale, "nav.home")}>
              {/* The logo: teal wordmark with the gold flame. A small static PNG; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/asmita-wordmark-v2.png" alt="Asmita" width={317} height={94} className="brand-logo brand-logo-footer" />
            </Link>
            {isHi ? (
              <p className="site-footer-desc site-footer-desc-hi hi">
                छवि-आधारित दुर्व्यवहार के विरुद्ध एक स्वतंत्र तकनीकी मंच। किसी सरकारी संस्था से संबद्ध नहीं।
              </p>
            ) : (
              <p className="site-footer-desc en">
                An independent technology platform against image-based abuse in India.
                Not affiliated with any government body.
              </p>
            )}
            <div className="site-footer-lang">
              <span className="site-footer-col-title !mb-0">{t(locale, "nav.language")}</span>
              <LanguageToggle initialLocale={locale} label={t(locale, "nav.language")} />
            </div>
            {/* The minor-support path collects nothing, not even a newsletter
                email, so its AppShell hides this block entirely. */}
            {!withoutNewsletter && (
              <div className="site-footer-newsletter">
                <p className="site-footer-col-title !mb-0">{t(locale, "org.newsletter.footerLabel")}</p>
                <NewsletterInlineForm locale={locale} source="footer" variant="footer" />
              </div>
            )}
          </div>

          {columns.map((col) => (
            <div key={col.title} className="site-footer-col">
              <p className="site-footer-col-title">{col.title}</p>
              <ul className="site-footer-col-list">
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    {/* A full page load for /check-image: its own headers allow the C2PA WASM reader. */}
                    {link.href === "/check-image" ? (
                      <a href={link.href}>{link.label}</a>
                    ) : link.href.startsWith("https://") ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="site-footer-bottom-bar flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="site-footer-helpline !mt-0">
            <p className="site-footer-cl-label">
              {isHi ? "अस्मिता हेल्पलाइन (24/7)" : "Asmita helpline (24/7)"} ·{" "}
              <a href={`tel:${HELPLINE.tel}`} className="font-medium text-[var(--ink)]">
                {HELPLINE.display}
              </a>
              {" · "}
              {isHi ? "महिला हेल्पलाइन" : "Women's helpline"} ·{" "}
              <a href="tel:181" className="font-medium text-[var(--ink)]">
                181
              </a>
              {" · "}
              {isHi ? "आपातकाल" : "Emergency"}{" "}
              <a href="tel:112" className="font-medium text-[var(--ink)]">
                112
              </a>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <ul className="site-footer-utility">
              {utilityLinks.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith("https://") ? (
                    <a href={link.href}>{link.label}</a>
                  ) : (
                    <Link href={link.href}>{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
            {isHi ? (
              <p className="site-footer-bottom site-footer-bottom-hi hi !text-left sm:!text-right">
                © 2026 Asmita · JAMSAQ Studio
              </p>
            ) : (
              <p className="site-footer-bottom en !text-left sm:!text-right">
                © 2026 Asmita · Built by JAMSAQ Studio
              </p>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
