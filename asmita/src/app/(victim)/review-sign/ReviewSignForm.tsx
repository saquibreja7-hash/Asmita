"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { DRAFT_KEY } from "@/lib/eligibility";
import { t, type Locale } from "@/lib/i18n";

type HashEntry = { hash: string; quality: number; clientVersion: string };

type Draft = {
  registrationKey?: string;
  urls: string[];
  hashes: HashEntry[];
  platformIds: string[];
  emailPlatformIds: string[];
  formOnlyPlatforms: { id: string; name: string; formUrl: string }[];
  declaration: boolean;
};

type Step =
  | "loading"
  | "review"
  | "creating"
  | "sign"
  | "signing"
  | "hash-sign"
  | "hash-signing"
  | "form-only-handoff";

// When no notice is left to sign: a link on a platform that only takes its
// own form needs the survivor to file that form, so they go to the handoff;
// anything else waiting (a new site, a contact being checked) is ours to do.
async function pathAfterNotices(caseId: string, preview: Response) {
  const { error } = (await preview.json().catch(() => ({}))) as { error?: string };
  return error === "form_only_platform" ? `/handoff/${caseId}` : `/case/${caseId}/confirmation`;
}

function CheckItem({ heading, detail }: { heading: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
        aria-hidden
      >
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l2.5 2.5L9 1" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{heading}</p>
        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
      </div>
    </div>
  );
}

export function ReviewSignForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caseId, setCaseId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [pendingFormPlatforms, setPendingFormPlatforms] = useState<{ id: string; name: string; formUrl: string }[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [signedCount, setSignedCount] = useState(0);
  const started = useRef(false);
  // Review and signing are one screen: the case is created as soon as the
  // draft is read, so the notice preview appears without another click.
  const startCase = useEffectEvent((d: Draft) => {
    if (started.current) return;
    started.current = true;
    void createCase(d);
  });

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) { router.replace("/submit"); return; }
        const data = JSON.parse(raw) as Draft;
        if (!data.urls?.length && !data.hashes?.length) { router.replace("/submit"); return; }
        data.registrationKey ??= crypto.randomUUID();
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
        setDraft(data);
        setStep("creating");
        startCase(data);
      } catch {
        router.replace("/submit");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [router]);

  async function createCase(d: Draft) {
    setStep("creating");
    setError("");
    try {
      const declared = await csrfFetch("/api/profile/declaration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledged: true, version: "v1.0-2026-05-12", language: locale }),
      });
      if (!declared.ok) {
        setError(t(locale, "submit.declaration.error"));
        setStep("review");
        return;
      }
      const createRes = await csrfFetch("/api/cases/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": d.registrationKey ?? crypto.randomUUID(),
        },
        body: JSON.stringify({ urls: d.urls, declaration: d.declaration }),
      });
      if (!createRes.ok) {
        const response = (await createRes.json().catch(() => ({}))) as { error?: string };
        setError(t(locale, response.error === "invalid_urls" ? "review.error.links" : "review.error.createCase"));
        setStep("review");
        return;
      }
      const { caseId: newCaseId } = (await createRes.json()) as { caseId: string };

      if (d.hashes.length > 0) {
        const hashRes = await csrfFetch(`/api/cases/${newCaseId}/hashes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hashes: d.hashes,
            declaration: true,
            platformIds: d.platformIds,
          }),
        });
        if (!hashRes.ok) {
          setError(t(locale, "review.error.hashes"));
          setStep("review");
          return;
        }

        // Hash-only path: no URLs
        if (d.urls.length === 0) {
          if (d.emailPlatformIds.length > 0) {
            // Save form-only platforms to state before clearing d (sessionStorage won't survive)
            if (d.formOnlyPlatforms.length > 0) {
              setPendingFormPlatforms(d.formOnlyPlatforms);
            }
            sessionStorage.removeItem(DRAFT_KEY);
            setCaseId(newCaseId);
            setPreviewUrl(`/api/cases/${newCaseId}/preview-hash-advisory`);
            setStep("hash-sign");
          } else {
            // Form-only platforms only — show all of them inline
            sessionStorage.removeItem(DRAFT_KEY);
            if (d.formOnlyPlatforms.length > 0) {
              setPendingFormPlatforms(d.formOnlyPlatforms);
              setCaseId(newCaseId);
              setStep("form-only-handoff");
            } else {
              router.push(`/case/${newCaseId}/confirmation`);
            }
          }
          return;
        }
      }

      sessionStorage.removeItem(DRAFT_KEY);
      setCaseId(newCaseId);

      const previewRes = await fetch(`/api/cases/${newCaseId}/preview-notice`);
      if (previewRes.ok) {
        setPreviewUrl(`/api/cases/${newCaseId}/preview-notice`);
        setStep("sign");
      } else {
        router.push(await pathAfterNotices(newCaseId, previewRes));
      }
    } catch {
      setError(t(locale, "review.error.generic"));
      setStep("review");
    }
  }

  async function signNotice() {
    if (!caseId) return;
    setStep("signing");
    setError("");
    try {
      const res = await csrfFetch(`/api/cases/${caseId}/sign-notice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim(), signature: signature.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "already_signed"
            ? t(locale, "review.sign.error.alreadySigned")
            : t(locale, "review.sign.error.timeout"),
        );
        setStep("sign");
        return;
      }
      // Each link has its own notice. If another is ready, sign it here too;
      // the signature and confirmation are given again for every notice.
      const next = await fetch(`/api/cases/${caseId}/preview-notice`);
      if (next.ok) {
        const count = signedCount + 1;
        setSignedCount(count);
        setSignature("");
        setAgreed(false);
        setPreviewUrl(`/api/cases/${caseId}/preview-notice?after=${count}`);
        setStep("sign");
        return;
      }
      router.push(await pathAfterNotices(caseId, next));
    } catch {
      setError(t(locale, "review.sign.error.timeout"));
      setStep("sign");
    }
  }

  async function signHashAdvisory() {
    if (!caseId || !draft) return;
    setStep("hash-signing");
    setError("");
    try {
      const res = await csrfFetch(`/api/cases/${caseId}/sign-hash-advisory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim(),
          signature: signature.trim(),
          platformIds: draft.emailPlatformIds,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "already_signed"
            ? t(locale, "review.sign.error.alreadySigned")
            : t(locale, "review.sign.error.timeout"),
        );
        setStep("hash-sign");
        return;
      }
      if (pendingFormPlatforms.length > 0) {
        setStep("form-only-handoff");
      } else {
        router.push(`/case/${caseId}/confirmation`);
      }
    } catch {
      setError(t(locale, "review.sign.error.timeout"));
      setStep("hash-sign");
    }
  }

  const canSign =
    name.trim().length > 0 &&
    contact.trim().length > 0 &&
    signature.trim().length > 0 &&
    agreed &&
    step !== "signing" &&
    step !== "hash-signing";

  if (step === "loading") return null;

  if (step === "form-only-handoff") {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-12 md:flex-row md:items-start md:gap-16">
        <aside className="order-2 md:order-1 md:w-64 md:shrink-0">
          <div className="md:sticky md:top-28">
            <span className="pill"><span className="dot" />{t(locale, "review.formOnly.pill")}</span>
            <p className="muted mt-5 text-sm leading-[1.75]">
              {t(locale, "review.formOnly.sub")}
            </p>
            <div className="mt-8 space-y-4">
              <CheckItem heading={t(locale, "review.formOnly.aside.item1.heading")} detail={t(locale, "review.formOnly.aside.item1.detail")} />
              <CheckItem heading={t(locale, "review.formOnly.aside.item2.heading")} detail={t(locale, "review.formOnly.aside.item2.detail")} />
              <CheckItem heading={t(locale, "review.formOnly.aside.item3.heading")} detail={t(locale, "review.formOnly.aside.item3.detail")} />
            </div>
          </div>
        </aside>

        <div className="order-1 min-w-0 flex-1 md:order-2 space-y-8">
          <div>
            <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
              {t(locale, "review.formOnly.title")}
            </h1>
            <p className="muted mt-2 text-sm leading-[1.75]">
              {pendingFormPlatforms.length} {t(locale, "review.formOnly.intro")}
            </p>
          </div>

          <div className="space-y-4">
            {pendingFormPlatforms.map((platform) => (
              <a
                key={platform.id}
                href={platform.formUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--teal)] transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">{platform.name}</p>
                  <p className="muted mt-0.5 text-xs">{t(locale, "review.formOnly.openForm")} {platform.name} →</p>
                </div>
                <svg className="ml-4 shrink-0 text-[var(--teal)]" width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 10h10M10 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href={`/case/${caseId}`}>
              {t(locale, "review.formOnly.cta.dashboard")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (step === "review" || step === "creating") {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-12 md:flex-row md:items-start md:gap-16">
        <aside className="order-2 md:order-1 md:w-64 md:shrink-0">
          <div className="md:sticky md:top-28">
            <span className="pill"><span className="dot" />{t(locale, "review.pill")}</span>
            <p className="muted mt-5 text-sm leading-[1.75]">
              {t(locale, "review.aside.sub")}
            </p>
            <div className="mt-8 space-y-4">
              <CheckItem heading={t(locale, "review.aside.item1.heading")} detail={t(locale, "review.aside.item1.detail")} />
              <CheckItem heading={t(locale, "review.aside.item2.heading")} detail={t(locale, "review.aside.item2.detail")} />
              <CheckItem heading={t(locale, "review.aside.item3.heading")} detail={t(locale, "review.aside.item3.detail")} />
            </div>
          </div>
        </aside>

        <div className="order-1 min-w-0 flex-1 md:order-2 space-y-8">
          <div>
            <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
              {t(locale, "review.title")}
            </h1>
            <p className="muted mt-2 text-sm leading-[1.75]">
              {t(locale, "review.sub")}
            </p>
          </div>

          {draft && draft.urls.length > 0 && (
            <div
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
            >
              <p className="text-sm font-medium text-[var(--foreground)]">
                {t(locale, "review.links.label")} ({draft.urls.length})
              </p>
              <ul className="mt-3 space-y-1.5">
                {draft.urls.map((url, i) => (
                  <li key={i} className="break-all font-mono text-[13px] text-[var(--muted)]">
                    {url}
                  </li>
                ))}
              </ul>
              {draft.urls.length > 1 && (
                <p className="muted mt-4 text-xs leading-[1.65]">
                  {t(locale, "review.links.moreNote")}
                </p>
              )}
            </div>
          )}

          {draft && draft.hashes.length > 0 && (
            <div
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[16px] bg-[var(--teal-soft)]">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="1" y="1" width="5" height="5" rx="1" stroke="var(--teal)" strokeWidth="1.2"/>
                    <rect x="8" y="1" width="5" height="5" rx="1" stroke="var(--teal)" strokeWidth="1.2"/>
                    <rect x="1" y="8" width="5" height="5" rx="1" stroke="var(--teal)" strokeWidth="1.2"/>
                    <path d="M8 10.5h5M10.5 8v5" stroke="var(--teal)" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </span>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {t(locale, "review.fingerprints.label")}
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--teal-soft)] px-2 py-0.5 font-mono text-[11px] text-[var(--teal)]">{draft.hashes.length}</span>
                </p>
              </div>
              <ul className="mt-4 space-y-2">
                {draft.hashes.map((h, i) => {
                  const q = h.quality;
                  const qColor = q >= 70 ? "text-[var(--success)] bg-[#dff5ea]" : q >= 50 ? "text-[var(--warning)] bg-[#f3ead0]" : "text-[var(--danger)] bg-[#f8e1de]";
                  return (
                    <li key={i} className="flex items-center justify-between rounded-[16px] border border-[var(--hairline)] px-3 py-2.5">
                      <span className="font-mono text-[12px] text-[var(--muted)]">{h.hash.slice(0, 8)}&thinsp;&middot;&thinsp;{h.hash.slice(8, 16)}&thinsp;&middot;&thinsp;&hellip;</span>
                      <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${qColor}`}>{q}%</span>
                    </li>
                  );
                })}
              </ul>
              {draft.platformIds.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {draft.emailPlatformIds.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M1 3l5 3.5L11 3M1 3h10v7H1V3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                      {draft.emailPlatformIds.length} {t(locale, "review.fingerprints.emailNote")}
                    </span>
                  )}
                  {draft.formOnlyPlatforms.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2 2h8v8H2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/><path d="M4 5h4M4 7h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                      {draft.formOnlyPlatforms.length} {t(locale, "review.fingerprints.formNote")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm font-medium text-[var(--rose)]">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 sm:flex-row-reverse sm:justify-between">
            <button
              type="button"
              className="btn btn-primary"
              disabled={step === "creating"}
              onClick={() => {
                if (!draft) return;
                setStep("creating");
                void createCase(draft);
              }}
            >
              {step === "creating" ? t(locale, "review.cta.creating") : t(locale, "review.cta.retry")}
            </button>
            <a className="btn btn-secondary" href="/submit">
              {t(locale, "review.cta.back")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Shared sign form used for both URL notice and hash advisory
  const isHashSign = step === "hash-sign" || step === "hash-signing";
  const onSign = isHashSign ? signHashAdvisory : signNotice;
  const signingInProgress = step === "signing" || step === "hash-signing";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 md:flex-row md:items-start md:gap-16">
      <aside className="order-2 md:order-1 md:w-64 md:shrink-0">
        <div className="md:sticky md:top-28">
          <span className="pill">
            <span className="dot" />
            {isHashSign ? t(locale, "review.sign.hashPill") : t(locale, "review.sign.pill")}
          </span>
          <p className="muted mt-5 text-sm leading-[1.75]">
            {isHashSign ? t(locale, "review.sign.aside.hashSub") : t(locale, "review.sign.aside.sub")}
          </p>
          <div className="mt-8 space-y-4">
            <CheckItem heading={t(locale, "review.sign.aside.item1.heading")} detail={t(locale, "review.sign.aside.item1.detail")} />
            <CheckItem heading={t(locale, "review.sign.aside.item2.heading")} detail={t(locale, "review.sign.aside.item2.detail")} />
            <CheckItem heading={t(locale, "review.sign.aside.item3.heading")} detail={t(locale, "review.sign.aside.item3.detail")} />
          </div>
        </div>
      </aside>

      <div className="order-1 min-w-0 flex-1 md:order-2 space-y-8">
        <div>
          <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
            {isHashSign ? t(locale, "review.sign.hashTitle") : t(locale, "review.sign.title")}
          </h1>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "review.sign.sub")}
          </p>
        </div>

        {signedCount > 0 && !isHashSign && (
          <p className="rounded-[16px] bg-[var(--teal-soft)] px-4 py-3 text-sm font-medium text-[var(--teal-dark)]" role="status">
            {t(locale, "review.sign.nextNote")}
          </p>
        )}

        {draft && draft.urls.length > 0 && !isHashSign && (
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {t(locale, "review.links.label")} ({draft.urls.length})
            </p>
            <ul className="mt-2 space-y-1">
              {draft.urls.map((url) => (
                <li key={url} className="break-all font-mono text-[13px] text-[var(--muted)]">{url}</li>
              ))}
            </ul>
          </div>
        )}

        <div
          className="overflow-hidden rounded-[24px] border border-[var(--border)]"
        >
          <div className="border-b border-[var(--hairline)] bg-[var(--surface)] px-5 py-3">
            <p className="font-mono text-[12px] uppercase tracking-[-0.033em] text-[var(--muted)]">
              {isHashSign ? t(locale, "review.sign.hashPreviewLabel") : t(locale, "review.sign.previewLabel")}
            </p>
          </div>
          <iframe
            src={previewUrl}
            className="w-full"
            style={{ height: "520px", border: "none" }}
            title={isHashSign ? t(locale, "review.sign.hashPreviewLabel") : t(locale, "review.sign.previewLabel")}
          />
        </div>

        <div
          className="space-y-5 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <p className="text-sm font-medium text-[var(--foreground)]">{t(locale, "review.sign.details.title")}</p>

          <div>
            <label htmlFor="rs-name" className="block text-sm font-medium text-[var(--foreground)]">
              {t(locale, "review.sign.name.label")}
            </label>
            <p className="muted mt-1 text-sm">{t(locale, "review.sign.name.sub")}</p>
            <input
              id="rs-name"
              type="text"
              className="field mt-2"
              placeholder={t(locale, "review.sign.name.placeholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="rs-contact" className="block text-sm font-medium text-[var(--foreground)]">
              {t(locale, "review.sign.contact.label")}
            </label>
            <p className="muted mt-1 text-sm">{t(locale, "review.sign.contact.sub")}</p>
            <input
              id="rs-contact"
              type="text"
              className="field mt-2"
              placeholder={t(locale, "review.sign.contact.placeholder")}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={200}
              autoComplete="email"
            />
          </div>
        </div>

        <div
          className="space-y-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <p className="text-sm font-medium text-[var(--foreground)]">{t(locale, "review.sign.sig.title")}</p>
          <p className="muted text-sm leading-[1.6]">
            {t(locale, "review.sign.sig.sub")}
          </p>
          <input
            id="rs-signature"
            type="text"
            className="field font-display text-[18px] italic"
            placeholder={t(locale, "review.sign.sig.placeholder")}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </div>

        <div className="hairline" />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm leading-[1.65] text-[var(--foreground)]">
            {isHashSign ? t(locale, "review.sign.agree.hash") : t(locale, "review.sign.agree.notice")}
          </span>
        </label>

        {error && (
          <p className="text-sm font-medium text-[var(--rose)]">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 sm:flex-row-reverse sm:justify-between">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSign}
            onClick={onSign}
          >
            {signingInProgress ? t(locale, "review.sign.cta.signing") : t(locale, "review.sign.cta.sign")}
          </button>
          <a className="btn btn-secondary" href={`/case/${caseId}`}>
            {t(locale, "review.sign.cta.skip")}
          </a>
        </div>
      </div>
    </div>
  );
}
