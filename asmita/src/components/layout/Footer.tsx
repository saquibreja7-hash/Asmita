import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { HELPLINE } from "@/lib/helpline";
import { LanguageDrawer } from "@/components/layout/LanguageDrawer";
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
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <div>
              <Link href="/" className="site-footer-logo-link" aria-label={t(locale, "nav.home")}>
                {/* Transparent teal logo on a white panel, so it shows on the teal footer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/asmita-logo-teal.png" alt="Asmita" width={400} height={200} className="brand-logo brand-logo-footer" />
              </Link>
              {isHi ? (
                <p className="site-footer-tagline hi">
                  छवि-आधारित दुर्व्यवहार के विरुद्ध एक स्वतंत्र तकनीकी मंच। किसी सरकारी संस्था से संबद्ध नहीं।
                </p>
              ) : (
                <p className="site-footer-tagline en">
                  An independent technology platform against image-based abuse in India. Not affiliated with any
                  government body.
                </p>
              )}
            </div>
            {/* The minor-support path collects nothing, so it hides the newsletter. */}
            {!withoutNewsletter && (
              <div className="site-footer-newsletter">
                <p className="site-footer-newsletter-label">{t(locale, "org.newsletter.footerLabel")}</p>
                <NewsletterInlineForm locale={locale} source="footer" variant="footer" />
              </div>
            )}
          </div>

          <nav className="site-footer-cols" aria-label={isHi ? "फ़ुटर" : "Footer"}>
            {columns.map((col) => (
              <div key={col.title} className="site-footer-col">
                <p className="site-footer-col-title">{col.title}</p>
                <ul className="site-footer-col-list">
                  {col.links.map((link) => (
                    <li key={link.href + link.label}>
                      {/* A full page load for /check-image: its own headers allow the C2PA WASM reader. */}
                      {link.href === "/check-image" ? (
                        <a href={link.href}>{link.label}</a>
                      ) : (
                        <Link href={link.href}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="site-footer-bottom-bar">
          <p className={`site-footer-helpline ${isHi ? "hi" : "en"}`}>
            {isHi ? "अस्मिता हेल्पलाइन (24/7)" : "Asmita helpline (24/7)"} · <a href={`tel:${HELPLINE.tel}`}>{HELPLINE.display}</a>
            {" · "}{isHi ? "महिला हेल्पलाइन" : "Women's helpline"} · <a href="tel:181">181</a>
            {" · "}{isHi ? "आपातकाल" : "Emergency"} · <a href="tel:112">112</a>
          </p>
          <div className="site-footer-bottom-right">
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
          <LanguageDrawer initialLocale={locale} label={t(locale, "nav.language")} />
          </div>
        </div>
      </div>
    </footer>
  );
}
