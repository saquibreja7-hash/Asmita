import Link from "next/link";
import { type Locale } from "@/lib/i18n";

export function Footer({ locale }: { locale: Locale }) {
  const isHi = locale === "hi";

  return (
    <footer role="contentinfo">
      <div className="wrap">
        <div className="footer-top">
          <div>
            <Link href="/" className="footer-brand-logo" aria-label="Asmita home">
              <img
                src="/asmita-wordmark.png"
                alt="Asmita"
                className="footer-logo"
                width={520}
                height={178}
              />
            </Link>
            {isHi ? (
              <p className="footer-desc footer-desc-hi hi">
                गरिमा बहाली के लिए एक स्वतंत्र मंच। किसी सरकारी संस्था से संबद्ध नहीं।
              </p>
            ) : (
              <p className="footer-desc en">
                An independent platform for dignity restoration. Not affiliated with any government body.
              </p>
            )}
          </div>

          <div className="footer-childline">
            <p className="footer-cl-label">
              {isHi ? "आपातकालीन हेल्पलाइन" : "Emergency helpline"}
            </p>
            <p className="footer-cl-num">1098</p>
            <p className="footer-cl-sub">CHILDLINE · 24 hours · Free</p>
          </div>

          <div className="footer-links">
            <nav className="footer-nav" aria-label="Footer navigation">
              <div className="footer-row">
                <Link href="/how-it-works">{isHi ? "हमारे बारे में" : "About"}</Link>
                <Link href="/resources">{isHi ? "संसाधन" : "Resources"}</Link>
                <Link href="/faq">FAQ</Link>
              </div>
              <div className="footer-row">
                <Link href="/privacy">{isHi ? "गोपनीयता" : "Privacy"}</Link>
                <Link href="/legal">{isHi ? "कानूनी" : "Legal"}</Link>
                <Link href="/contact">{isHi ? "संपर्क" : "Contact"}</Link>
              </div>
            </nav>
          </div>
        </div>

        {isHi ? (
          <p className="footer-bottom footer-bottom-hi hi">
            © 2026 Asmita. हमेशा निःशुल्क। · अगर आप तुरंत खतरे में हैं, तो{" "}
            <strong style={{ color: "var(--teal)" }}>112</strong> पर कॉल करें।
          </p>
        ) : (
          <p className="footer-bottom en">
            © 2026 Asmita. Free to use, always. · If you are in immediate danger, call{" "}
            <strong style={{ color: "var(--teal)" }}>112</strong>.
          </p>
        )}
      </div>
    </footer>
  );
}
