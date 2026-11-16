"use client";

import { useState } from "react";
import { previewNotice, sendNotice, type NoticePreview } from "./findings-client";

export function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// Preview first, then send exactly what was previewed: the digest from the
// preview goes back with the send, so the server refuses if anything changed.
export function NoticeStep({ findingId }: { findingId: string }) {
  const [preview, setPreview] = useState<NoticePreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [sentAt, setSentAt] = useState<string | null>(null);

  async function doPreview() {
    setBusy("preview");
    setError(null);
    setErrorCode(undefined);
    const result = await previewNotice(findingId);
    setBusy(null);
    if (!result.ok) {
      setPreview(null);
      setError(result.message);
      setErrorCode(result.code);
      return;
    }
    setPreview(result.data.preview);
  }

  async function doSend() {
    if (!preview) return;
    setBusy("send");
    setError(null);
    setErrorCode(undefined);
    const result = await sendNotice(findingId, preview.digest);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      setErrorCode(result.code);
      // The text on screen is no longer what would be sent.
      if (result.code === "notice_changed") setPreview(null);
      return;
    }
    setSentAt(result.data.sentAt);
  }

  const unverified = preview !== null && !preview.contactVerified;
  const formOnly = preview?.channel === "form_only";
  const canSend = preview !== null && !unverified && !formOnly && !sentAt;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-secondary" disabled={busy !== null || Boolean(sentAt)} onClick={doPreview} type="button">
          {busy === "preview" ? "Loading…" : preview ? "Preview again" : "Preview notice"}
        </button>
        {!unverified && !formOnly && (
          <button className="btn btn-primary" disabled={!canSend || busy !== null} onClick={doSend} type="button">
            {busy === "send" ? "Sending…" : "Send notice"}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {error && (
          <p className="text-sm text-[var(--danger)]" data-code={errorCode} role="alert">
            {error}
          </p>
        )}
        {sentAt && (
          <p className="text-sm text-[var(--brand)]" role="status">
            Notice sent{preview?.recipient ? ` to ${preview.recipient}` : ""} on {formatTime(sentAt)}.
          </p>
        )}
      </div>

      {preview && (
        <div className="a-card grid gap-3 p-4 text-sm">
          {unverified && (
            <p className="font-medium" role="status">
              Contact not verified: {preview.platformName} has no human-verified grievance contact, so a notice cannot be
              sent. Ask an admin who edits platforms to verify the contact.
            </p>
          )}
          {formOnly && !unverified && (
            <p className="font-medium" role="status">
              {preview.platformName} only takes reports through its own form. Copy the text below into that form; it
              cannot be sent from here.
              {preview.formUrl ? (
                <>
                  {" "}
                  Form: <code className="font-mono break-all" translate="no">{preview.formUrl}</code>
                </>
              ) : null}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="muted">Platform</dt>
            <dd>{preview.platformName}</dd>
            <dt className="muted">Recipient</dt>
            <dd className="font-mono break-all">{preview.recipient ?? "Not available"}</dd>
            <dt className="muted">Subject</dt>
            <dd>{preview.subject}</dd>
          </dl>
          <div>
            <p className="eyebrow">Body, exactly as it will be sent</p>
            <pre
              className="mt-2 whitespace-pre-wrap break-words rounded border border-[var(--line)] p-3 font-mono text-xs"
              tabIndex={0}
            >
              {preview.body}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
