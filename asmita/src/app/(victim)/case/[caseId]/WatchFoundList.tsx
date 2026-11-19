"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DisplayUrl } from "@/lib/case-ops";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { foundLinkView } from "./crawl-consent-logic";
import { StatusBadge } from "./StatusBadge";

/*
 * The possible copies on her watch page (WP22). Site name only — no link,
 * no preview, no way to open the address — with her two choices:
 * - "Take it down" turns the watch into a case and asks for the full crawl
 *   authorisation on the spot; nothing is sent by this click itself.
 * - "Not now" keeps watching and sends nothing at all: it is her say-so for
 *   this copy on this screen, and the copy stays listed in case she changes
 *   her mind.
 */

export function WatchFoundList({
  caseId,
  urls,
  locale,
}: {
  caseId: string;
  urls: Array<Pick<DisplayUrl, "id" | "domain" | "platformName" | "status" | "crawlConsentWithdrawn" | "representativeNoticeSentAt">>;
  locale: Locale;
}) {
  const router = useRouter();
  const [deferred, setDeferred] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");

  async function takeDown() {
    setError("");
    setConverting(true);
    try {
      const response = await csrfFetch(`/api/cases/${caseId}/watch/convert`, { method: "POST" });
      if (!response.ok) {
        setError(t(locale, "case.watch.takeDown.error"));
        return;
      }
      // The watch is now a case: the page asks for the full crawl
      // authorisation tick where the notice comes from.
      router.push(`/case/${caseId}#crawl-consent`);
    } catch {
      setError(t(locale, "case.watch.takeDown.error"));
    } finally {
      setConverting(false);
    }
  }

  function notNow(id: string) {
    // Nothing is sent and nothing changes on the server: she keeps watching.
    setDeferred((previous) => new Set([...previous, id]));
  }

  if (urls.length === 0) return null;

  return (
    <section id="found" aria-labelledby="case-watch-copies-title" className="scroll-mt-24">
      <h2 id="case-watch-copies-title" className="subsection-title">{t(locale, "case.watch.copiesTitle")}</h2>
      <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "case.watch.copiesSub")}</p>
      <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
        {urls.map((url) => {
          const view = foundLinkView(url);
          const choseNotNow = deferred.has(url.id);
          return (
            <li key={url.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-[var(--ink)]">{url.platformName}</p>
                <p className="font-mono mt-0.5 break-all text-[12px] text-[var(--text-muted)]">{url.domain}</p>
                {view.kind === "sent" && (
                  <p className="muted mt-1 text-xs">
                    {t(locale, "case.found.sentOn")}{" "}
                    {new Date(view.sentAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {view.kind === "withdrawn" ? (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--page)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                    {t(locale, "case.found.withdrawn")}
                  </span>
                ) : (
                  <StatusBadge status={view.status} locale={locale} />
                )}
                {!choseNotNow && view.kind !== "sent" && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className="btn btn-primary btn-compact" disabled={converting} onClick={takeDown}>
                      {converting ? t(locale, "case.watch.takeDown.working") : t(locale, "case.watch.takeDown")}
                    </button>
                    <button type="button" className="btn btn-secondary btn-compact" disabled={converting} onClick={() => notNow(url.id)}>
                      {t(locale, "case.watch.notNow")}
                    </button>
                  </div>
                )}
                {choseNotNow && (
                  <p role="status" className="text-xs text-[var(--text-muted)]">{t(locale, "case.watch.notNowNote")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-[var(--danger)]">{error}</p>}
    </section>
  );
}
