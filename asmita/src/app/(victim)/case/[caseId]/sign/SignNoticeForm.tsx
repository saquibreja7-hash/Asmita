"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { isPdfSafeText } from "@/lib/pdf-text";

interface Props {
  caseId: string;
  urlId: string;
  /** Names the template text the preview shows; signing sends it back. */
  templateRef: string;
  platformName: string;
  previewPdfUrl: string;
  confirmationUrl: string;
  locale: Locale;
}

export function SignNoticeForm({ caseId, urlId, templateRef, platformName, previewPdfUrl, confirmationUrl, locale }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // The notice PDF shows Latin letters only; say so before signing.
  const nameUnsupported = !isPdfSafeText(name.trim().normalize("NFC"));
  const signatureUnsupported = !isPdfSafeText(signature.trim().normalize("NFC"));
  const canSubmit = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim()) && signature.trim() && !nameUnsupported && !signatureUnsupported && agreed && !submitting;

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const res = await csrfFetch(`/api/cases/${caseId}/sign-notice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urlId, templateRef, name: name.trim(), contact: contact.trim(), signature: signature.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "notice_changed_since_preview") {
          // Reload the page so the preview shows the current text, and ask
          // for a fresh review and confirmation. The typed details are kept.
          setAgreed(false);
          setError(t(locale, "sign.error.noticeChanged"));
          router.refresh();
          return;
        }
        setError(data.error === "already_signed"
          ? t(locale, "sign.error.alreadySigned")
          : data.error === "name_script_unsupported"
            ? t(locale, "sign.error.nameScript")
            : data.error === "notice_pdf_failed"
              ? t(locale, "sign.error.pdf")
              : t(locale, "sign.error.generic"));
        return;
      }
      // The endpoint waits until no other notice is ready to sign.
      await csrfFetch(`/api/cases/${caseId}/acknowledge`, { method: "POST" }).catch(() => undefined);
      router.push(confirmationUrl);
    } catch {
      setError(t(locale, "sign.error.timeout"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">

      {/* PDF Preview */}
      <div className="overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)]">
        <div className="border-b border-[var(--line)] bg-[var(--page)] px-5 py-3">
          <p className="eyebrow">
            {t(locale, "sign.preview.label")} - {platformName}
          </p>
        </div>
        <iframe
          src={previewPdfUrl}
          className="w-full"
          style={{ height: "520px", border: "none" }}
          title={t(locale, "sign.preview.label")}
        />
      </div>

      {/* Survivor details */}
      <div className="space-y-5 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
        <p className="text-sm font-medium text-[var(--ink)]">{t(locale, "sign.details.title")}</p>

        <div>
          <label htmlFor="sign-name" className="block text-sm font-medium text-[var(--ink)]">
            {t(locale, "sign.name.label")}
          </label>
          <p className="muted mt-1 text-sm">{t(locale, "sign.name.sub")}</p>
          <input
            id="sign-name"
            type="text"
            className="field mt-2"
            placeholder={t(locale, "sign.name.placeholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="name"
            aria-invalid={nameUnsupported || undefined}
          />
          {nameUnsupported && (
            <p role="alert" className="mt-2 text-sm font-medium text-[var(--danger)]">{t(locale, "sign.error.nameScript")}</p>
          )}
        </div>

        <div>
          <label htmlFor="sign-contact" className="block text-sm font-medium text-[var(--ink)]">
            {t(locale, "sign.contact.label")}
          </label>
          <p className="muted mt-1 text-sm">{t(locale, "sign.contact.sub")}</p>
          <input
            id="sign-contact"
            type="email"
            inputMode="email"
            className="field mt-2"
            placeholder={t(locale, "sign.contact.placeholder")}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
            autoComplete="email"
          />
        </div>
      </div>

      {/* Signature */}
      <div className="space-y-4 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
        <p className="text-sm font-medium text-[var(--ink)]">{t(locale, "sign.sig.title")}</p>
        <p className="muted text-sm leading-[1.6]">
          {t(locale, "sign.sig.sub")}
        </p>
        <input
          id="sign-signature"
          type="text"
          className="field font-display text-[18px]"
          placeholder={t(locale, "sign.sig.placeholder")}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          maxLength={100}
          autoComplete="off"
          aria-invalid={signatureUnsupported || undefined}
        />
        {signatureUnsupported && !nameUnsupported && (
          <p role="alert" className="text-sm font-medium text-[var(--danger)]">{t(locale, "sign.error.nameScript")}</p>
        )}
      </div>

      {/* Declaration */}
      <div className="hairline" />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-sm leading-[1.65] text-[var(--ink)]">
          {t(locale, "sign.agree.prefix")} {platformName} {t(locale, "sign.agree.suffix")}
        </span>
      </label>

      {error && (
        <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? t(locale, "sign.cta.signing") : t(locale, "sign.cta.sign")}
        </button>
        <a className="btn btn-secondary" href={confirmationUrl}>
          {t(locale, "sign.cta.skip")}
        </a>
      </div>
    </div>
  );
}
