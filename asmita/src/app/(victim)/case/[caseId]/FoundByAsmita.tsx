import type { ReactNode } from "react";
import { t, type Locale } from "@/lib/i18n";
import { findPlatformByDomain } from "@/lib/platforms";

/*
 * Links Asmita's search found and a reviewer confirmed. Site name only: no
 * link, no preview, no way to open the address, and nothing for her to sign.
 */
export function FoundByAsmita({
  urls,
  locale,
  badge,
}: {
  urls: { id: string; domain: string; platformName: string; status: string }[];
  locale: Locale;
  badge: (status: string) => ReactNode;
}) {
  if (urls.length === 0) return null;
  return (
    <section id="found" aria-labelledby="case-found-title" className="scroll-mt-24">
      <h2 id="case-found-title" className="subsection-title">{t(locale, "case.found.title")}</h2>
      <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.found.sub")}</p>
      <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
        {urls.map((url) => (
          <li key={url.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0">
              {findPlatformByDomain(url.domain) && <p className="font-medium text-[var(--ink)]">{url.platformName}</p>}
              <p className="font-mono mt-0.5 break-all text-[12px] text-[var(--text-muted)]">{url.domain}</p>
            </div>
            {badge(url.status)}
          </li>
        ))}
      </ul>
    </section>
  );
}
