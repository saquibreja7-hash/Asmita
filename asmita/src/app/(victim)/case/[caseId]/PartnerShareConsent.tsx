"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { parseShare, requestAgree, requestStop, shareView, type ShareState } from "./partner-share-logic";

/*
 * The survivor's choice to let Asmita share her approved fingerprints with
 * partner platforms (GET/POST/DELETE /api/cases/:id/partner-share), under
 * the crawl opt-in and in the same style. One tick box: ticking it is the
 * whole agreement, with no name, contact, signature or second
 * confirmation. The fingerprints it covers are listed masked, exactly like
 * the fingerprints section above — never a hash value, digest or id. The
 * full agreement text stays one click away in a disclosure she never has
 * to open. Unticking asks once, with what stopping does, then withdraws.
 * When sharing cannot be switched on (hash upload off, no reviewed
 * template, nothing approved on the case) nothing is shown; once she has
 * agreed the section always stays, so she can always stop sharing.
 */

const MASK = "••••••••";

export function PartnerShareConsent({
  caseId,
  locale,
  eligibleCount,
  initialShare = null,
}: {
  caseId: string;
  locale: Locale;
  eligibleCount: number;
  initialShare?: ShareState | null;
}) {
  const router = useRouter();
  const [share, setShare] = useState<ShareState | null>(initialShare);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async (): Promise<ShareState | null> => {
    try {
      const res = await fetch(`/api/cases/${caseId}/partner-share`, { cache: "no-store" });
      if (!res.ok) return null;
      const next = parseShare((await res.json()) as Parameters<typeof parseShare>[0]);
      setShare(next);
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

  const view = shareView(share, eligibleCount);
  // Hidden: not loaded yet, or off with nothing it could cover. No broken control.
  if (!share || view === "hidden") return <p role="status" aria-live="polite" className="sr-only">{announce}</p>;
  const on = view === "on";

  async function agree() {
    if (!share?.draft) return;
    setError("");
    setBusy(true);
    try {
      const result = await requestAgree(csrfFetch, caseId, share.draft.templateRef);
      if (!result.ok) {
        if (result.outcome === "changed") {
          // The agreement text changed since the page loaded: show the
          // current text and ask her to tick again.
          setError(t(locale, "partnerShare.error.changed"));
          await load();
        } else if (result.outcome === "alreadyAgreed") {
          await load();
          router.refresh();
        } else if (result.outcome === "unavailable") {
          await load();
        } else {
          setError(t(locale, "partnerShare.error.generic"));
        }
        return;
      }
      await load();
      setAnnounce(t(locale, "partnerShare.announce.on"));
      router.refresh();
    } catch {
      setError(t(locale, "partnerShare.error.timeout"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setError("");
    setBusy(true);
    try {
      if (!(await requestStop(csrfFetch, caseId))) {
        setError(t(locale, "partnerShare.error.stop"));
        return;
      }
      setConfirmingStop(false);
      await load();
      setAnnounce(t(locale, "partnerShare.announce.off"));
      router.refresh();
    } catch {
      setError(t(locale, "partnerShare.error.timeout"));
    } finally {
      setBusy(false);
    }
  }

  function onTickChange(checked: boolean) {
    setError("");
    if (checked && !on) void agree();
    // Ticking again while asked whether to stop means keep sharing.
    else if (checked && on) setConfirmingStop(false);
    else if (!checked && on) setConfirmingStop(true);
  }

  return (
    <section id="partner-share" aria-labelledby="partner-share-title" className="scroll-mt-24 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
      <h2 id="partner-share-title" className="subsection-title">{t(locale, "partnerShare.title")}</h2>
      <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "partnerShare.intro")}</p>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          id="partner-share-tick"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          checked={on && !confirmingStop}
          disabled={busy}
          aria-describedby="partner-share-tick-sub"
          onChange={(e) => onTickChange(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium leading-[1.65] text-[var(--ink)]">{t(locale, "partnerShare.checkbox")}</span>
          <span id="partner-share-tick-sub" className="muted mt-1 block text-sm leading-[1.65]">{t(locale, "partnerShare.checkbox.sub")}</span>
        </span>
      </label>

      {busy && !on && <p className="muted mt-3 text-sm">{t(locale, "partnerShare.cta.working")}</p>}

      {on && !confirmingStop && (
        <div className="mt-4">
          <p className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--brand-strong)]">
            {t(locale, "partnerShare.state.on")}
          </p>
          <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "partnerShare.on.sub")}</p>
        </div>
      )}

      {on && confirmingStop && (
        <div role="group" aria-labelledby="partner-share-stop-title" className="mt-5 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-5">
          <p id="partner-share-stop-title" className="text-sm font-medium text-[var(--ink)]">{t(locale, "partnerShare.stop.title")}</p>
          <ul className="muted mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.65]">
            <li>{t(locale, "partnerShare.stop.1")}</li>
            <li>{t(locale, "partnerShare.stop.2")}</li>
            <li>{t(locale, "partnerShare.stop.3")}</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={stop}>
              {busy ? t(locale, "partnerShare.stop.working") : t(locale, "partnerShare.stop.confirm")}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmingStop(false)}>
              {t(locale, "partnerShare.stop.keep")}
            </button>
          </div>
        </div>
      )}

      {!on && share.status === "withdrawn" && <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "partnerShare.state.withdrawn")}</p>}

      {eligibleCount > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-[var(--ink)]">{t(locale, "partnerShare.list.title")}</p>
          <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
            {Array.from({ length: eligibleCount }, (_, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                {/* Masked like a password, exactly like the fingerprints
                    section above: no hash value, digest or id is rendered. */}
                <span className="text-[15px] font-medium text-[var(--ink)]">{t(locale, "case.fingerprints.item").replace("{n}", String(index + 1))}</span>
                <span aria-hidden="true" className="select-none font-mono text-[15px] tracking-[0.2em] text-[var(--text-muted)]">{MASK}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!on && share.draft && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand-strong)]">{t(locale, "partnerShare.details.summary")}</summary>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">{t(locale, "partnerShare.auth.title")}</p>
              <p className="muted mt-1 text-sm">{t(locale, "partnerShare.auth.englishNote")}</p>
              <div
                role="region"
                aria-label={t(locale, "partnerShare.auth.title")}
                tabIndex={0}
                className="mt-3 max-h-80 overflow-y-auto rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-4 text-sm leading-[1.65] text-[var(--ink)]"
              >
                <p className="font-medium">{share.draft.subject}</p>
                <p className="mt-3 whitespace-pre-wrap break-words">{share.draft.body}</p>
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
