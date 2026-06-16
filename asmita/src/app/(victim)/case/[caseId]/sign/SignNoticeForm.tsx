"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

interface Props {
  caseId: string;
  urlId: string;
  platformName: string;
  previewPdfUrl: string;
  confirmationUrl: string;
  locale: Locale;
}

export function SignNoticeForm({ caseId, urlId, platformName, previewPdfUrl, confirmationUrl, locale }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim() && contact.trim() && signature.trim() && agreed && !submitting;

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const res = await csrfFetch(`/api/cases/${caseId}/sign-notice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urlId, name: name.trim(), contact: contact.trim(), signature: signature.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error === "already_signed"
          ? t(locale, "sign.error.alreadySigned")
          : t(locale, "sign.error.generic"));
        return;
      }
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
      <div className="overflow-hidden rounded-xl border border-[var(--border)]" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="border-b border-[var(--hairline)] bg-[var(--surface)] px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
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
      <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <p className="text-sm font-semibold text-[var(--foreground)]">{t(locale, "sign.details.title")}</p>

        <div>
          <label htmlFor="sign-name" className="block text-sm font-semibold text-[var(--foreground)]">
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
          />
        </div>

        <div>
          <label htmlFor="sign-contact" className="block text-sm font-semibold text-[var(--foreground)]">
            {t(locale, "sign.contact.label")}
          </label>
          <p className="muted mt-1 text-sm">{t(locale, "sign.contact.sub")}</p>
          <input
            id="sign-contact"
            type="text"
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
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <p className="text-sm font-semibold text-[var(--foreground)]">{t(locale, "sign.sig.title")}</p>
        <p className="muted text-sm leading-[1.6]">
          {t(locale, "sign.sig.sub")}
        </p>
        <input
          id="sign-signature"
          type="text"
          className="field font-display text-[18px] italic"
          placeholder={t(locale, "sign.sig.placeholder")}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          maxLength={100}
          autoComplete="off"
        />
      </div>

      {/* Declaration */}
      <div className="hairline" />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-sm leading-[1.65] text-[var(--foreground)]">
          {t(locale, "sign.agree.prefix")} {platformName} {t(locale, "sign.agree.suffix")}
        </span>
      </label>

      {error && (
        <p className="text-sm font-semibold text-[var(--rose)]">{error}</p>
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
