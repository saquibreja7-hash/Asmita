"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";

// Share links on a post page (docs/org/spec.md, 56.1): copy link plus plain
// WhatsApp, X, LinkedIn and email links. No third-party scripts or buttons.

export function ShareLinks({ locale, url, title }: { locale: Locale; url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
      <span className="eyebrow">{t(locale, "org.post.shareTitle")}</span>
      <button type="button" className="pill hover:border-[var(--brand)]" onClick={copyLink} aria-live="polite">
        {copied ? t(locale, "org.post.copied") : t(locale, "org.post.copyLink")}
      </button>
      <a className="pill hover:border-[var(--brand)]" href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`} rel="noopener noreferrer">
        WhatsApp
      </a>
      <a className="pill hover:border-[var(--brand)]" href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`} rel="noopener noreferrer">
        X
      </a>
      <a className="pill hover:border-[var(--brand)]" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} rel="noopener noreferrer">
        LinkedIn
      </a>
      <a className="pill hover:border-[var(--brand)]" href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}>
        {locale === "hi" ? "ईमेल" : "Email"}
      </a>
    </div>
  );
}
