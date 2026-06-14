"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

interface Props {
  caseId: string;
  urlId: string;
  platformName: string;
  previewPdfUrl: string;
  confirmationUrl: string;
}

export function SignNoticeForm({ caseId, urlId, platformName, previewPdfUrl, confirmationUrl }: Props) {
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
          ? "This notice has already been signed."
          : "Something went wrong. Please try again.");
        return;
      }
      router.push(confirmationUrl);
    } catch {
      setError("The request timed out or failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* PDF Preview */}
      <div className="rounded-[14px] border border-[var(--hairline)] overflow-hidden">
        <div className="bg-[var(--surface)] px-4 py-3 border-b border-[var(--hairline)]">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Notice preview — {platformName}
          </p>
        </div>
        <iframe
          src={previewPdfUrl}
          className="w-full"
          style={{ height: "520px", border: "none" }}
          title="Notice preview"
        />
      </div>

      {/* Survivor details */}
      <div className="rounded-[14px] border border-[var(--hairline)] bg-white p-6 space-y-5">
        <p className="font-display text-[15px] font-medium tracking-tight text-[var(--foreground)]">
          Your details
        </p>

        <div>
          <label htmlFor="sign-name" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
            Full name
          </label>
          <input
            id="sign-name"
            type="text"
            className="field"
            placeholder="Your full legal name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="sign-contact" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
            Contact (email or phone)
          </label>
          <input
            id="sign-contact"
            type="text"
            className="field"
            placeholder="email@example.com or +91 98765 43210"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
            autoComplete="email"
          />
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            This is included in the notice so the platform can contact you if needed.
          </p>
        </div>
      </div>

      {/* Signature */}
      <div className="rounded-[14px] border border-[var(--hairline)] bg-white p-6 space-y-4">
        <p className="font-display text-[15px] font-medium tracking-tight text-[var(--foreground)]">
          Signature
        </p>
        <p className="text-sm text-[var(--muted)] leading-[1.6]">
          Type your name below as your digital signature. By signing, you confirm the
          declaration in the notice is accurate.
        </p>
        <input
          id="sign-signature"
          type="text"
          className="field font-display text-[18px] italic"
          placeholder="Type your full name"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          maxLength={100}
          autoComplete="off"
        />
      </div>

      {/* Declaration checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--hairline)] bg-white p-4 transition-colors hover:border-[var(--border)]">
        <input
          type="checkbox"
          className="mt-[3px] h-4 w-4 accent-[var(--teal)]"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="font-display text-[15px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[16px]">
          I confirm that the information above is accurate and I authorise Asmita to
          send this takedown notice to {platformName} on my behalf.
        </span>
      </label>

      {error && (
        <p className="text-center text-sm font-semibold text-[var(--rose)]">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? "Signing…" : "Sign and submit"}
        </button>
        <a className="btn btn-secondary" href={confirmationUrl}>
          Skip for now
        </a>
      </div>
    </div>
  );
}
