"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { isPdfSafeText } from "@/lib/pdf-text";
import { FormError } from "@/components/FormError";

// The contact address the platform may reply to; the same shape the route checks.
const CONTACT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * One link's takedown notice (urlId + platformName), or the case's fingerprint
 * advisory (hashAdvisoryPlatformIds: the platforms already chosen for it,
 * sent unchanged, so signing again never changes who receives it).
 */
type Props = {
  caseId: string;
  /** Names the template text and fingerprints the preview shows; signing sends it back. */
  templateRef: string;
  previewPdfUrl: string;
  confirmationUrl: string;
  locale: Locale;
} & (
  | { urlId: string; platformName: string; hashAdvisoryPlatformIds?: undefined }
  | { hashAdvisoryPlatformIds: string[]; urlId?: undefined; platformName?: undefined }
);

export function SignNoticeForm({ caseId, urlId, templateRef, platformName, hashAdvisoryPlatformIds, previewPdfUrl, confirmationUrl, locale }: Props) {
  const advisory = hashAdvisoryPlatformIds !== undefined;
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Field-level messages, shown beside their field and cleared on input (A10).
  const [nameError, setNameError] = useState("");
  const [contactError, setContactError] = useState("");
  const [agreeError, setAgreeError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const agreeRef = useRef<HTMLInputElement>(null);

  // The notice PDF shows Latin letters only; say so before signing.
  const nameUnsupported = !isPdfSafeText(name.trim().normalize("NFC"));

  // The sign button is never disabled to block validation (A9): submitting
  // shows the first problem beside its field and moves focus to it (A10).
  function focusFirstError(): boolean {
    if (!name.trim()) {
      setNameError(t(locale, "sign.error.nameRequired"));
      nameRef.current?.focus();
      return true;
    }
    if (nameUnsupported) {
      // The script message is already on screen under the name field.
      nameRef.current?.focus();
      return true;
    }
    if (!CONTACT_PATTERN.test(contact.trim())) {
      setContactError(t(locale, "sign.error.contact"));
      contactRef.current?.focus();
      return true;
    }
    if (!agreed) {
      setAgreeError(t(locale, "sign.error.agree"));
      agreeRef.current?.focus();
      return true;
    }
    return false;
  }

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      // Her full name is her signature; the server signs with it.
      const details = { templateRef, name: name.trim(), contact: contact.trim() };
      const res = await csrfFetch(`/api/cases/${caseId}/${advisory ? "sign-hash-advisory" : "sign-notice"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(advisory ? { ...details, platformIds: hashAdvisoryPlatformIds } : { urlId, ...details }),
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
    <form
      className="space-y-8"
      onSubmit={(e) => {
        // Enter submits like a click (A9); the signed text and the request
        // body are untouched — only the entry point changed.
        e.preventDefault();
        if (focusFirstError()) return;
        void handleSubmit();
      }}
    >

      {/* PDF Preview */}
      <div className="overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--page)] px-5 py-3">
          <p className="eyebrow">
            {advisory ? t(locale, "review.sign.hashPreviewLabel") : `${t(locale, "sign.preview.label")} - ${platformName}`}
          </p>
          {/* Android Chrome shows no PDF inside a frame; this link opens the
              same URL the frame holds, so she can read before signing. */}
          <a
            href={previewPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline text-sm font-medium text-[var(--ink)]"
          >
            {t(locale, "review.sign.openNotice")}
          </a>
        </div>
        <iframe
          src={previewPdfUrl}
          className="w-full"
          style={{ height: "520px", border: "none" }}
          title={advisory ? t(locale, "review.sign.hashPreviewLabel") : t(locale, "sign.preview.label")}
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
          <p id="sign-name-signature" className="muted mt-1 text-sm">{t(locale, "sign.name.signature")}</p>
          <input
            id="sign-name"
            ref={nameRef}
            aria-describedby={`sign-name-signature${nameError ? " sign-name-error" : ""}`}
            type="text"
            className="field mt-2"
            placeholder={t(locale, "sign.name.placeholder")}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(""); }}
            maxLength={100}
            autoComplete="name"
            aria-invalid={nameUnsupported || nameError ? true : undefined}
          />
          {nameUnsupported && (
            <p role="alert" className="mt-2 text-sm font-medium text-[var(--danger)]">{t(locale, "sign.error.nameScript")}</p>
          )}
          <FormError id="sign-name-error" message={nameError} className="mt-2" />
        </div>

        <div>
          <label htmlFor="sign-contact" className="block text-sm font-medium text-[var(--ink)]">
            {t(locale, "sign.contact.label")}
          </label>
          <p id="sign-contact-help" className="muted mt-1 text-sm">{t(locale, "sign.contact.sub")}</p>
          <input
            id="sign-contact"
            ref={contactRef}
            aria-describedby={`sign-contact-help${contactError ? " sign-contact-error" : ""}`}
            type="email"
            inputMode="email"
            className="field mt-2"
            placeholder={t(locale, "sign.contact.placeholder")}
            value={contact}
            onChange={(e) => { setContact(e.target.value); setContactError(""); }}
            onBlur={() => {
              // Checked when she leaves the field, not while she types (A10).
              if (contact.trim() && !CONTACT_PATTERN.test(contact.trim())) {
                setContactError(t(locale, "sign.error.contact"));
              }
            }}
            maxLength={200}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={contactError ? true : undefined}
          />
          <FormError id="sign-contact-error" message={contactError} className="mt-2" />
        </div>
      </div>

      {/* Declaration */}
      <div className="hairline" />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          ref={agreeRef}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          checked={agreed}
          onChange={(e) => { setAgreed(e.target.checked); setAgreeError(""); }}
        />
        <span className="text-sm leading-[1.65] text-[var(--ink)]">
          {advisory ? t(locale, "review.sign.agree.hash") : `${t(locale, "sign.agree.prefix")} ${platformName} ${t(locale, "sign.agree.suffix")}`}
        </span>
      </label>
      <FormError id="sign-agree-error" message={agreeError} />

      <FormError message={error} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? t(locale, "sign.cta.signing") : t(locale, "sign.cta.sign")}
        </button>
        {/* Skipping the advisory leaves it unsigned, so back to the case page, where it is still offered. */}
        <a className="btn btn-secondary" href={advisory ? `/case/${caseId}` : confirmationUrl}>
          {t(locale, "sign.cta.skip")}
        </a>
      </div>
    </form>
  );
}
