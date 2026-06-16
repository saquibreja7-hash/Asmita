"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

type HashEntry = { hash: string; quality: number; clientVersion: string };

type Draft = {
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
        <p className="text-sm font-semibold text-[var(--foreground)]">{heading}</p>
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

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem("asmita_submit_draft");
        if (!raw) { router.replace("/submit"); return; }
        const data = JSON.parse(raw) as Draft;
        if (!data.urls?.length && !data.hashes?.length) { router.replace("/submit"); return; }
        setDraft(data);
        setStep("review");
      } catch {
        router.replace("/submit");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [router]);

  async function createCase() {
    if (!draft) return;
    setStep("creating");
    setError("");
    try {
      const createRes = await csrfFetch("/api/cases/create", { method: "POST" });
      if (!createRes.ok) {
        setError(t(locale, "review.error.createCase"));
        setStep("review");
        return;
      }
      const { caseId: newCaseId } = (await createRes.json()) as { caseId: string };

      if (draft.urls.length > 0) {
        const urlRes = await csrfFetch(`/api/cases/${newCaseId}/urls`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls: draft.urls, declaration: true }),
        });
        if (!urlRes.ok) {
          setError(t(locale, "review.error.links"));
          setStep("review");
          return;
        }
      }

      if (draft.hashes.length > 0) {
        const hashRes = await csrfFetch(`/api/cases/${newCaseId}/hashes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hashes: draft.hashes,
            declaration: true,
            platformIds: draft.platformIds,
          }),
        });
        if (!hashRes.ok) {
          setError(t(locale, "review.error.hashes"));
          setStep("review");
          return;
        }

        // Hash-only path: no URLs
        if (draft.urls.length === 0) {
          if (draft.emailPlatformIds.length > 0) {
            // Save form-only platforms to state before clearing draft (sessionStorage won't survive)
            if (draft.formOnlyPlatforms.length > 0) {
              setPendingFormPlatforms(draft.formOnlyPlatforms);
            }
            sessionStorage.removeItem("asmita_submit_draft");
            setCaseId(newCaseId);
            setPreviewUrl(`/api/cases/${newCaseId}/preview-hash-advisory`);
            setStep("hash-sign");
          } else {
            // Form-only platforms only — show all of them inline
            sessionStorage.removeItem("asmita_submit_draft");
            if (draft.formOnlyPlatforms.length > 0) {
              setPendingFormPlatforms(draft.formOnlyPlatforms);
              setCaseId(newCaseId);
              setStep("form-only-handoff");
            } else {
              router.push(`/case/${newCaseId}/confirmation`);
            }
          }
          return;
        }
      }

      sessionStorage.removeItem("asmita_submit_draft");
      setCaseId(newCaseId);

      const previewRes = await fetch(`/api/cases/${newCaseId}/preview-notice`);
      if (previewRes.ok) {
        setPreviewUrl(`/api/cases/${newCaseId}/preview-notice`);
        setStep("sign");
      } else {
        router.push(`/case/${newCaseId}`);
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
      router.push(`/case/${caseId}`);
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
        router.push(`/case/${caseId}`);
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
      <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">
        <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
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

        <div className="min-w-0 flex-1 space-y-8">
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
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--teal)] transition-colors"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{platform.name}</p>
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
      <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">
        <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
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

        <div className="min-w-0 flex-1 space-y-8">
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
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">
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
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {t(locale, "review.fingerprints.label")} ({draft.hashes.length})
              </p>
              <ul className="mt-3 space-y-1.5">
                {draft.hashes.map((h, i) => (
                  <li key={i} className="font-mono text-[13px] text-[var(--muted)]">
                    {h.hash.slice(0, 16)}... (quality {h.quality}/100)
                  </li>
                ))}
              </ul>
              {draft.platformIds.length > 0 && (
                <p className="muted mt-3 text-xs leading-[1.65]">
                  {t(locale, "review.fingerprints.platformsNote")} {draft.platformIds.length}
                  {draft.emailPlatformIds.length > 0 && ` (${draft.emailPlatformIds.length} ${t(locale, "review.fingerprints.emailNote")})`}
                  {draft.formOnlyPlatforms.length > 0 && ` (${draft.formOnlyPlatforms.length} ${t(locale, "review.fingerprints.formNote")})`}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm font-semibold text-[var(--rose)]">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={step === "creating"}
              onClick={createCase}
            >
              {step === "creating" ? t(locale, "review.cta.creating") : t(locale, "review.cta.create")}
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
    <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">
      <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
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

      <div className="min-w-0 flex-1 space-y-8">
        <div>
          <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
            {isHashSign ? t(locale, "review.sign.hashTitle") : t(locale, "review.sign.title")}
          </h1>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "review.sign.sub")}
          </p>
        </div>

        <div
          className="overflow-hidden rounded-xl border border-[var(--border)]"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="border-b border-[var(--hairline)] bg-[var(--surface)] px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
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
          className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <p className="text-sm font-semibold text-[var(--foreground)]">{t(locale, "review.sign.details.title")}</p>

          <div>
            <label htmlFor="rs-name" className="block text-sm font-semibold text-[var(--foreground)]">
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
            <label htmlFor="rs-contact" className="block text-sm font-semibold text-[var(--foreground)]">
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
          className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <p className="text-sm font-semibold text-[var(--foreground)]">{t(locale, "review.sign.sig.title")}</p>
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
          <p className="text-sm font-semibold text-[var(--rose)]">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
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
