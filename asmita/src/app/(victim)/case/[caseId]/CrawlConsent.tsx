"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { consentView, parseConsent, reuploadWatchView, requestConsent, requestStop, tickChecked, type ConsentState } from "./crawl-consent-logic";

/*
 * The survivor's choice to let Asmita look for copies of her images
 * (GET/POST/DELETE /api/cases/:id/crawl-consent). One tick box: ticking it
 * switches the search on at once, with no name, signature or second
 * confirmation. The full authorisation (and how the search works) is there
 * for anyone who wants to open it, never required. Unticking asks once, with
 * what stopping does, then withdraws. When the server says switching on is
 * not available (crawler off, or the text not yet reviewed by legal) nothing
 * is shown, and no internal reason is ever shown. Stopping always works.
 *
 * The watch variant (WP22 "Watch for my images", case mode = WATCH) ticks
 * the watch-only authorisation: search and alert, nothing sent to any
 * platform unless she chooses. Stopping is "Stop watching" and also deletes
 * her fingerprints (the route does it for watch cases).
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

const WATCH_EXPLAIN_KEYS = [
  "watch.explain.1",
  "watch.explain.2",
  "watch.explain.3",
  "watch.explain.4",
  "watch.explain.5",
  "watch.explain.6",
] as const;

export function CrawlConsent({
  caseId,
  locale,
  initialConsent = null,
  watch = false,
  onNowOn,
  caseOpen = true,
}: {
  caseId: string;
  locale: Locale;
  initialConsent?: ConsentState | null;
  /** The watch-only wording (WP22); a watch case renders this variant. */
  watch?: boolean;
  /** Called once when the tick switches the search on (the /watch flow then sends her to her watch page). */
  onNowOn?: () => void;
  /** Watch-and-verify WP24: false once her case is closed, so a live authorisation reads as the re-upload watch. */
  caseOpen?: boolean;
}) {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);
  const [confirmingStop, setConfirmingStop] = useState(false);
  // Her tick, before the server confirms it: the controlled box must follow
  // the click at once, not the network (tickChecked; WP34).
  const [pendingOn, setPendingOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");

  const k = useCallback(
    (keyCase: MessageKey, keyWatch: MessageKey): MessageKey => (watch ? keyWatch : keyCase),
    [watch],
  );

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
  const reupload = reuploadWatchView(consent, caseOpen);
  const reuploadDate = reupload
    ? new Date(reupload.until).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })
    : null;

  async function switchOn() {
    if (!consent?.draft) return;
    setError("");
    // The tick lands before the request: she sees the box ticked (and locked)
    // while it runs, and a refusal unticks it with the reason shown.
    setPendingOn(true);
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
      setAnnounce(t(locale, k("crawl.announce.on", "watch.announce.on")));
      onNowOn?.();
      router.refresh();
    } catch {
      setError(t(locale, "crawl.error.timeout"));
    } finally {
      setPendingOn(false);
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
      setAnnounce(t(locale, k("crawl.announce.off", "watch.announce.off")));
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

  const stopKeys = watch
    ? (["watch.stop.1", "watch.stop.fingerprints", "watch.stop.record"] as const)
    : (["crawl.stop.1", "crawl.stop.2", "crawl.stop.3"] as const);

  return (
    <section id="crawl-consent" aria-labelledby="crawl-title" className="scroll-mt-24 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
      <h2 id="crawl-title" className="subsection-title">{t(locale, watch ? "watch.title" : "crawl.title")}</h2>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          id="crawl-tick"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          checked={tickChecked({ on, pendingOn, confirmingStop })}
          disabled={busy}
          aria-describedby="crawl-tick-sub"
          onChange={(e) => onTickChange(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium leading-[1.65] text-[var(--ink)]">{t(locale, k("crawl.checkbox", "watch.tick"))}</span>
          <span id="crawl-tick-sub" className="muted mt-1 block text-sm leading-[1.65]">{t(locale, k("crawl.checkbox.sub", "watch.tick.sub"))}</span>
        </span>
      </label>

      {busy && !on && <p className="muted mt-3 text-sm">{t(locale, "crawl.cta.working")}</p>}

      {on && !confirmingStop && reupload && reuploadDate && (
        <div className="mt-4">
          <p className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--brand-strong)]">
            {t(locale, "crawl.watch.until").replace("{date}", reuploadDate)}
          </p>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "crawl.watch.sub")}</p>
          <button type="button" className="btn btn-secondary mt-4" disabled={busy} onClick={() => setConfirmingStop(true)}>
            {t(locale, "crawl.watch.stop")}
          </button>
        </div>
      )}

      {on && !confirmingStop && !reupload && (
        <div className="mt-4">
          <p className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--brand-strong)]">
            {t(locale, k("crawl.state.on", "watch.state.on"))}
          </p>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, k("crawl.on.sub", "watch.on.sub"))}</p>
        </div>
      )}

      {on && confirmingStop && (
        <div role="group" aria-labelledby="crawl-stop-title" className="mt-5 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-5">
          <p id="crawl-stop-title" className="text-sm font-medium text-[var(--ink)]">
            {t(locale, reupload ? "crawl.watch.stop.title" : k("crawl.stop.title", "watch.stop.title"))}
          </p>
          <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
            {stopKeys.map((key) => <li key={key}>{t(locale, key)}</li>)}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={stop}>
              {busy ? t(locale, "crawl.stop.working") : t(locale, reupload ? "crawl.watch.stop.confirm" : k("crawl.stop.confirm", "watch.stop.confirm"))}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmingStop(false)}>
              {t(locale, reupload ? "crawl.watch.stop.keep" : k("crawl.stop.keep", "watch.stop.keep"))}
            </button>
          </div>
        </div>
      )}

      {!on && consent.status === "withdrawn" && <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, k("crawl.state.withdrawn", "watch.state.withdrawn"))}</p>}

      {!on && consent.draft && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand-strong)]">{t(locale, "crawl.details.summary")}</summary>
          <div className="mt-3 space-y-4">
            <div>
              <p className="muted text-sm leading-[1.75]">{t(locale, watch ? "watch.tick.sub" : "crawl.intro")}</p>
              <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
                {(watch ? WATCH_EXPLAIN_KEYS : EXPLAIN_KEYS).map((key) => <li key={key}>{t(locale, key)}</li>)}
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
