"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { consentView, parseConsent, reuploadWatchView, requestConsent, requestStop, type ConsentState } from "./crawl-consent-logic";

/*
 * The survivor's choice to let Asmita look for more copies of her images
 * (GET/POST/DELETE /api/cases/:id/crawl-consent). One tick box: ticking it
 * switches the search on at once, with no name, signature or second
 * confirmation. The full authorisation (and how the search works) is there
 * for anyone who wants to open it, never required. Unticking asks once, with
 * what stopping does, then withdraws. When the server says switching on is
 * not available (crawler off, or the text not yet reviewed by legal) nothing
 * is shown, and no internal reason is ever shown. Stopping always works.
 */

const EXPLAIN_KEYS = [
  "crawl.explain.1",
  "crawl.explain.2",
  "crawl.explain.3",
  "crawl.explain.4",
  "crawl.explain.5",
  "crawl.explain.6",
  "crawl.explain.7",
] as const;

export function CrawlConsent({ caseId, locale, caseOpen = true, initialConsent = null }: { caseId: string; locale: Locale; caseOpen?: boolean; initialConsent?: ConsentState | null }) {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async (): Promise<ConsentState | null> => {
    try {
      const res = await fetch(`/api/cases/${caseId}/crawl-consent`, { cache: "no-store" });
      if (!res.ok) return null;
      const next = parseConsent((await res.json()) as Parameters<typeof parseConsent>[0]);
      setConsent(next);
      return next;
    } catch {
      return null;
    }
  }, [caseId]);

  useEffect(() => {
    // Deferred a tick so no state is set synchronously inside the effect.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const view = consentView(consent);
  // Hidden: not loaded yet, or unavailable and not already on. No broken control.
  if (!consent || view === "hidden") return <p role="status" aria-live="polite" className="sr-only">{announce}</p>;
  const on = view === "on";
  // Watch-and-verify WP24: after the case closes, the live authorisation
  // watches for re-uploads until its window ends; the copy and the stop
  // button say that instead of the open case's search copy.
  const watch = reuploadWatchView(consent, caseOpen);
  const watchDate = watch
    ? new Date(watch.until).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })
    : null;

  async function switchOn() {
    if (!consent?.draft) return;
    setError("");
    setBusy(true);
    try {
      const result = await requestConsent(csrfFetch, caseId, consent.draft.templateRef);
      if (!result.ok) {
        if (result.outcome === "changed") {
          // The text or fingerprints changed since the page loaded: show the
          // current text and ask her to tick again.
          setError(t(locale, "crawl.error.changed"));
          await load();
        } else if (result.outcome === "alreadySigned") {
          await load();
          router.refresh();
        } else if (result.outcome === "unavailable") {
          await load();
        } else {
          setError(t(locale, "crawl.error.generic"));
        }
        return;
      }
      await load();
      setAnnounce(t(locale, "crawl.announce.on"));
      router.refresh();
    } catch {
      setError(t(locale, "crawl.error.timeout"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setError("");
    setBusy(true);
    try {
      if (!(await requestStop(csrfFetch, caseId))) {
        setError(t(locale, "crawl.error.stop"));
        return;
      }
      setConfirmingStop(false);
      await load();
      setAnnounce(t(locale, "crawl.announce.off"));
      router.refresh();
    } catch {
      setError(t(locale, "crawl.error.timeout"));
    } finally {
      setBusy(false);
    }
  }

  function onTickChange(checked: boolean) {
    setError("");
    if (checked && !on) void switchOn();
    // Ticking again while asked whether to stop means keep searching.
    else if (checked && on) setConfirmingStop(false);
    else if (!checked && on) setConfirmingStop(true);
  }

  return (
    <section id="crawl-consent" aria-labelledby="crawl-title" className="scroll-mt-24 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
      <h2 id="crawl-title" className="subsection-title">{t(locale, "crawl.title")}</h2>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          id="crawl-tick"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          checked={on && !confirmingStop}
          disabled={busy}
          aria-describedby="crawl-tick-sub"
          onChange={(e) => onTickChange(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium leading-[1.65] text-[var(--ink)]">{t(locale, "crawl.checkbox")}</span>
          <span id="crawl-tick-sub" className="muted mt-1 block text-sm leading-[1.65]">{t(locale, "crawl.checkbox.sub")}</span>
        </span>
      </label>

      {busy && !on && <p className="muted mt-3 text-sm">{t(locale, "crawl.cta.working")}</p>}

      {on && !confirmingStop && watch && watchDate && (
        <div className="mt-4">
          <p className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--brand-strong)]">
            {t(locale, "crawl.watch.until").replace("{date}", watchDate)}
          </p>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "crawl.watch.sub")}</p>
          <button type="button" className="btn btn-secondary mt-4" disabled={busy} onClick={() => setConfirmingStop(true)}>
            {t(locale, "crawl.watch.stop")}
          </button>
        </div>
      )}

      {on && !confirmingStop && !watch && (
        <div className="mt-4">
          <p className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--brand-strong)]">
            {t(locale, "crawl.state.on")}
          </p>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "crawl.on.sub")}</p>
        </div>
      )}

      {on && confirmingStop && (
        <div role="group" aria-labelledby="crawl-stop-title" className="mt-5 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-5">
          <p id="crawl-stop-title" className="text-sm font-medium text-[var(--ink)]">
            {t(locale, watch ? "crawl.watch.stop.title" : "crawl.stop.title")}
          </p>
          <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
            <li>{t(locale, "crawl.stop.1")}</li>
            <li>{t(locale, "crawl.stop.2")}</li>
            <li>{t(locale, "crawl.stop.3")}</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={stop}>
              {busy ? t(locale, "crawl.stop.working") : t(locale, watch ? "crawl.watch.stop.confirm" : "crawl.stop.confirm")}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmingStop(false)}>
              {t(locale, watch ? "crawl.watch.stop.keep" : "crawl.stop.keep")}
            </button>
          </div>
        </div>
      )}

      {!on && consent.status === "withdrawn" && <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "crawl.state.withdrawn")}</p>}

      {!on && consent.draft && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand-strong)]">{t(locale, "crawl.details.summary")}</summary>
          <div className="mt-3 space-y-4">
            <div>
              <p className="muted text-sm leading-[1.75]">{t(locale, "crawl.intro")}</p>
              <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
                {EXPLAIN_KEYS.map((key) => <li key={key}>{t(locale, key)}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">{t(locale, "crawl.auth.title")}</p>
              <p className="muted mt-1 text-sm">{t(locale, "crawl.auth.englishNote")}</p>
              <div
                role="region"
                aria-label={t(locale, "crawl.auth.title")}
                tabIndex={0}
                className="mt-3 max-h-80 overflow-y-auto rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-4 text-sm leading-[1.65] text-[var(--ink)]"
              >
                <p className="font-medium">{consent.draft.subject}</p>
                <p className="mt-3 whitespace-pre-wrap break-words">{consent.draft.body}</p>
              </div>
            </div>
          </div>
        </details>
      )}

      {error && <p role="alert" className="mt-4 text-sm font-medium text-[var(--danger)]">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
    </section>
  );
}
