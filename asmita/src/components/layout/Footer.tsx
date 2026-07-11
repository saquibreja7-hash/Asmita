import Link from "next/link";
import { type Locale } from "@/lib/i18n";

export function Footer({ locale }: { locale: Locale }) {
  const isHi = locale === "hi";

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-wrap">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-logo-link" aria-label="Asmita home">
              <img
                src="/asmita-wordmark.png"
                alt="Asmita"
                className="site-footer-logo"
                width={520}
                height={178}
              />
            </Link>
            {isHi ? (
              <p className="site-footer-desc site-footer-desc-hi hi">
                गरिमा बहाली के लिए एक स्वतंत्र मंच। किसी सरकारी संस्था से संबद्ध नहीं।
              </p>
            ) : (
              <p className="site-footer-desc en">
                An independent platform for dignity restoration. Not affiliated with any government body.
              </p>
            )}
          </div>

          <div className="site-footer-childline">
            <p className="site-footer-cl-label">
              {isHi ? "महिला हेल्पलाइन" : "Women's helpline"}
            </p>
            <p className="site-footer-cl-num">181</p>
            <p className="site-footer-cl-sub">{isHi ? "राष्ट्रीय महिला हेल्पलाइन · 24 घंटे" : "National Women Helpline · 24 hours"}</p>
          </div>

          <div className="site-footer-links">
            <nav className="site-footer-nav" aria-label="Footer navigation">
              <div className="site-footer-row">
                <Link href="/how-it-works">{isHi ? "हमारे बारे में" : "About"}</Link>
                <Link href="/resources">{isHi ? "संसाधन" : "Resources"}</Link>
                <Link href="/faq">{isHi ? "सामान्य प्रश्न" : "FAQ"}</Link>
              </div>
              <div className="site-footer-row">
                <Link href="/privacy">{isHi ? "गोपनीयता" : "Privacy"}</Link>
                <Link href="/legal">{isHi ? "कानूनी" : "Legal"}</Link>
                <Link href="/contact">{isHi ? "संपर्क" : "Contact"}</Link>
              </div>
            </nav>
          </div>
        </div>

        {isHi ? (
          <p className="site-footer-bottom site-footer-bottom-hi hi">
            © 2026 Asmita. · अगर आप तुरंत खतरे में हैं, तो{" "}
            <strong>112</strong> पर कॉल करें।
          </p>
        ) : (
          <p className="site-footer-bottom en">
            © 2026 Asmita. · If you are in immediate danger, call{" "}
            <strong>112</strong>.
          </p>
        )}
      </div>
    </footer>
  );
}
