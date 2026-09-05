import Link from "next/link";
import { type Locale } from "@/lib/i18n";

export function Footer({ locale }: { locale: Locale }) {
  const isHi = locale === "hi";

  const columns = isHi
    ? [
        {
          title: "समस्या",
          links: [
            { href: "/issue", label: "छवि-आधारित दुर्व्यवहार" },
            { href: "/check-image", label: "डीपफेक जाँच" },
            { href: "/how-it-works", label: "यह कैसे काम करता है" },
          ],
        },
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
          title: "संगठन",
          links: [
            { href: "/about", label: "हमारे बारे में" },
            { href: "/privacy", label: "गोपनीयता" },
            { href: "/legal", label: "कानूनी" },
            { href: "/contact", label: "संपर्क" },
            { href: "/sitemap", label: "साइटमैप" },
          ],
        },
      ]
    : [
        {
          title: "The Issue",
          links: [
            { href: "/issue", label: "Image-based abuse" },
            { href: "/issue/deepfakes", label: "Deepfakes and AI" },
            { href: "/who-we-help", label: "Who we help" },
            { href: "/glossary", label: "Glossary" },
          ],
        },
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
          title: "About",
          links: [
            { href: "/about", label: "Who we are" },
            { href: "/what-we-do", label: "What we do" },
            { href: "/privacy", label: "Privacy" },
            { href: "/contact", label: "Contact" },
            { href: "/sitemap", label: "Sitemap" },
          ],
        },
      ];

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-wrap">
        {/* Thorn-style: logo left, multi-col nav, helpline rightish */}
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-logo-link" aria-label="Asmita home">
              <span className="wordmark">Asmita</span>
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
          </div>

          {columns.map((col) => (
            <div key={col.title} className="site-footer-col">
              <p className="site-footer-col-title">{col.title}</p>
              <ul className="site-footer-col-list">
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="site-footer-bottom-bar flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="site-footer-helpline !mt-0">
            <p className="site-footer-cl-label">
              {isHi ? "महिला हेल्पलाइन" : "Women's helpline"} ·{" "}
              <a href="tel:181" className="font-medium text-[var(--color-off-black)]">
                181
              </a>
              {" · "}
              {isHi ? "आपातकाल" : "Emergency"}{" "}
              <a href="tel:112" className="font-medium text-[var(--color-off-black)]">
                112
              </a>
            </p>
          </div>
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
    </footer>
  );
}
