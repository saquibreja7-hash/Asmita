import type { ReactNode } from "react";
import type { DisplayUrl } from "@/lib/case-ops";
import { t, type Locale } from "@/lib/i18n";
import { findPlatformByDomain } from "@/lib/platforms";
import { foundLinkView } from "./crawl-consent-logic";

/*
 * Links Asmita's search found and a reviewer confirmed. Site name only: no
 * link, no preview, no way to open the address, and nothing for her to sign.
 * No escalation ladder: Asmita's representative notice states no deadline and
 * gets no automated follow-ups (docs/product/crawler-notice-flow.md).
 */
export function FoundByAsmita({
  urls,
  locale,
  badge,
}: {
  urls: Array<Pick<DisplayUrl, "id" | "domain" | "platformName" | "status" | "crawlConsentWithdrawn" | "representativeNoticeSentAt">>;
  locale: Locale;
  badge: (status: string) => ReactNode;
}) {
  if (urls.length === 0) return null;
  return (
    <section id="found" aria-labelledby="case-found-title" className="scroll-mt-24">
      <h2 id="case-found-title" className="subsection-title">{t(locale, "case.found.title")}</h2>
      <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.found.sub")}</p>
      <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
        {urls.map((url) => {
          const view = foundLinkView(url);
          return (
            <li key={url.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0">
                {findPlatformByDomain(url.domain) && <p className="font-medium text-[var(--ink)]">{url.platformName}</p>}
                <p className="font-mono mt-0.5 break-all text-[12px] text-[var(--text-muted)]">{url.domain}</p>
                {view.kind === "sent" && (
                  <p className="muted mt-1 text-xs">
                    {t(locale, "case.found.sentOn")}{" "}
                    {new Date(view.sentAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}
                  </p>
                )}
              </div>
              {view.kind === "withdrawn" ? (
                <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--page)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                  {t(locale, "case.found.withdrawn")}
                </span>
              ) : (
                badge(view.status)
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
