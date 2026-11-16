"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { isPdfSafeText } from "@/lib/pdf-text";
import { consentView, parseConsent, requestSign, requestStop, type ConsentState } from "./crawl-consent-logic";

/*
 * The survivor's choice to let Asmita look for more copies of her images
 * (GET/POST/DELETE /api/cases/:id/crawl-consent). Off until she ticks the box
 * and signs the authorisation, which is shown here in full. Never asks her for
 * more than the notice signing does. When the server says signing is not
 * available (crawler off, or the text not yet reviewed by legal) nothing is
 * shown, and no internal reason is ever shown. Stopping always works.
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

export function CrawlConsent({ caseId, locale, initialConsent = null, initialTicked = false }: { caseId: string; locale: Locale; initialConsent?: ConsentState | null; initialTicked?: boolean }) {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);
  const [ticked, setTicked] = useState(initialTicked);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
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
  const signed = view === "on";

  const nameUnsupported = !isPdfSafeText(name.trim().normalize("NFC"));
  const signatureUnsupported = !isPdfSafeText(signature.trim().normalize("NFC"));
  const canSign =
    Boolean(name.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim()) &&
    Boolean(signature.trim()) &&
    !nameUnsupported &&
    !signatureUnsupported &&
    agreed &&
    !busy;

  function untick() {
    setTicked(false);
    setAgreed(false);
    setError("");
  }

  async function sign() {
    if (!consent?.draft) return;
    setError("");
    setBusy(true);
    try {
      const result = await requestSign(csrfFetch, caseId, {
        templateRef: consent.draft.templateRef,
        name: name.trim(),
        contact: contact.trim(),
        signature: signature.trim(),
      });
      if (!result.ok) {
        if (result.outcome === "changed") {
          // Show the current text and ask her to read and agree again. Typed details are kept.
          setAgreed(false);
          setError(t(locale, "crawl.error.changed"));
          await load();
        } else if (result.outcome === "alreadySigned") {
          await load();
          router.refresh();
        } else if (result.outcome === "nameScript") {
          setError(t(locale, "sign.error.nameScript"));
        } else if (result.outcome === "unavailable") {
          untick();
          await load();
        } else {
          setError(t(locale, "crawl.error.generic"));
        }
        return;
      }
      await load();
      untick();
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

  return (
    <section id="crawl-consent" aria-labelledby="crawl-title" className="scroll-mt-24 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
      <h2 id="crawl-title" className="subsection-title">{t(locale, "crawl.title")}</h2>

      {signed ? (
        <div className="mt-3">
          <p className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--brand-strong)]">
            {t(locale, "crawl.state.on")}
          </p>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "crawl.on.sub")}</p>
          {confirmingStop ? (
            <div role="group" aria-labelledby="crawl-stop-title" className="mt-5 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-5">
              <p id="crawl-stop-title" className="text-sm font-medium text-[var(--ink)]">{t(locale, "crawl.stop.title")}</p>
              <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
                <li>{t(locale, "crawl.stop.1")}</li>
                <li>{t(locale, "crawl.stop.2")}</li>
                <li>{t(locale, "crawl.stop.3")}</li>
              </ul>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={stop}>
                  {busy ? t(locale, "crawl.stop.working") : t(locale, "crawl.stop.confirm")}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmingStop(false)}>
                  {t(locale, "crawl.stop.keep")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary mt-5" onClick={() => { setError(""); setConfirmingStop(true); }}>
              {t(locale, "crawl.stop.cta")}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="muted text-sm leading-[1.75]">{t(locale, "crawl.intro")}</p>
          <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
            {EXPLAIN_KEYS.map((key) => <li key={key}>{t(locale, key)}</li>)}
          </ul>
          {consent.status === "withdrawn" && <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "crawl.state.withdrawn")}</p>}

          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
              checked={ticked}
              aria-controls="crawl-authorisation"
              aria-expanded={ticked}
              onChange={(e) => (e.target.checked ? setTicked(true) : untick())}
            />
            <span className="text-sm font-medium leading-[1.65] text-[var(--ink)]">{t(locale, "crawl.checkbox")}</span>
          </label>

          <div id="crawl-authorisation">
            {ticked && consent.draft && (
              <div className="mt-6 space-y-6">
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

                <div className="space-y-5">
                  <div>
                    <label htmlFor="crawl-name" className="block text-sm font-medium text-[var(--ink)]">{t(locale, "sign.name.label")}</label>
                    <p className="muted mt-1 text-sm">{t(locale, "sign.name.sub")}</p>
                    <input id="crawl-name" type="text" className="field mt-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" aria-invalid={nameUnsupported || undefined} />
                    {nameUnsupported && <p role="alert" className="mt-2 text-sm font-medium text-[var(--danger)]">{t(locale, "sign.error.nameScript")}</p>}
                  </div>
                  <div>
                    <label htmlFor="crawl-contact" className="block text-sm font-medium text-[var(--ink)]">{t(locale, "sign.contact.label")}</label>
                    <p className="muted mt-1 text-sm">{t(locale, "sign.contact.sub")}</p>
                    <input id="crawl-contact" type="email" inputMode="email" className="field mt-2" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} autoComplete="email" />
                  </div>
                  <div>
                    <label htmlFor="crawl-signature" className="block text-sm font-medium text-[var(--ink)]">{t(locale, "sign.sig.title")}</label>
                    <p className="muted mt-1 text-sm">{t(locale, "sign.sig.sub")}</p>
                    <input id="crawl-signature" type="text" className="field font-display mt-2 text-[18px]" value={signature} onChange={(e) => setSignature(e.target.value)} maxLength={100} autoComplete="off" aria-invalid={signatureUnsupported || undefined} />
                    {signatureUnsupported && !nameUnsupported && <p role="alert" className="mt-2 text-sm font-medium text-[var(--danger)]">{t(locale, "sign.error.nameScript")}</p>}
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span className="text-sm leading-[1.65] text-[var(--ink)]">{t(locale, "crawl.agree")}</span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" disabled={!canSign} onClick={sign}>
                    {busy ? t(locale, "crawl.cta.signing") : t(locale, "crawl.cta.sign")}
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={untick}>
                    {t(locale, "crawl.cta.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm font-medium text-[var(--danger)]">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
    </section>
  );
}
