"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadPdf, PREVIEWS_PER_HOUR, previewNotice, sendNotice, type NoticePreview } from "./findings-client";
import { noticeGate, type NoticeGateInput } from "./finding-view";

export function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// Preview first, then send exactly what was previewed: the digest from the
// preview goes back with the send, so the server refuses if anything changed.
// The preview shows the page and image addresses, so it is a recorded reveal:
// the analyst says so before it runs, and it never runs by itself.
export function NoticeStep({ findingId, caseId, state }: { findingId: string; caseId: string; state: NoticeGateInput }) {
  const router = useRouter();
  const [preview, setPreview] = useState<NoticePreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [formUrl, setFormUrl] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const gate = noticeGate(state);

  function fail(result: { message: string; code?: string; formUrl?: string }) {
    setError(result.message);
    setErrorCode(result.code);
    setFormUrl(result.formUrl ?? null);
  }

  async function doPreview() {
    if (!acknowledged) return;
    setBusy("preview");
    setError(null);
    setErrorCode(undefined);
    setFormUrl(null);
    const result = await previewNotice(findingId, caseId);
    setBusy(null);
    // One acknowledgement per reveal.
    setAcknowledged(false);
    if (!result.ok) {
      setPreview(null);
      fail(result);
      return;
    }
    setPreview(result.data);
  }

  async function doSend() {
    if (!preview) return;
    setBusy("send");
    setError(null);
    setErrorCode(undefined);
    setFormUrl(null);
    const result = await sendNotice(findingId, caseId, preview.contentDigest);
    setBusy(null);
    if (!result.ok) {
      fail(result);
      // The text on screen is no longer what would be sent.
      if (result.code === "notice_changed") setPreview(null);
      return;
    }
    setSentAt(result.data.sentAt);
    setPreview(null);
    router.refresh();
  }

  if (gate.kind === "sent" || sentAt) {
    return (
      <p className="text-sm text-[var(--brand)]" role="status">
        Representative notice sent on {formatTime(sentAt ?? (gate.kind === "sent" ? gate.sentAt : ""))}. It is excluded from automated
        follow-ups.
      </p>
    );
  }
  if (gate.kind === "blocked") {
    return (
      <p className="text-sm font-medium" data-code={gate.code} role="status">
        {gate.message}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {gate.warning && (
        <p className="text-sm font-medium" data-testid="notice-unconfirmed" role="status">
          {gate.warning}
        </p>
      )}
      <label className="flex max-w-2xl items-start gap-2 text-sm" htmlFor={`ack-${findingId}`}>
        <input
          checked={acknowledged}
          disabled={busy !== null}
          id={`ack-${findingId}`}
          onChange={(event) => setAcknowledged(event.target.checked)}
          type="checkbox"
        />
        <span>
          I understand that the preview shows the page and image addresses as text, is recorded against my name as an
          address reveal, and counts towards the limit of {PREVIEWS_PER_HOUR} previews an hour.
        </span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-secondary" disabled={busy !== null || !acknowledged} onClick={doPreview} type="button">
          {busy === "preview" ? "Loading…" : preview ? "Preview again" : "Preview notice"}
        </button>
        <button className="btn btn-primary" disabled={preview === null || busy !== null} onClick={doSend} type="button">
          {busy === "send" ? "Sending…" : "Send notice"}
        </button>
      </div>

      <div aria-live="polite">
        {error && (
          <p className="text-sm text-[var(--danger)]" data-code={errorCode} role="alert">
            {error}
          </p>
        )}
        {formUrl && (
          <p className="mt-2 text-sm" data-testid="form-handoff" role="status">
            This platform takes reports through its own form, which a person at Asmita verified. File the report there by
            hand, on the equipment set aside for this work: <code className="font-mono break-all" translate="no">{formUrl}</code>
          </p>
        )}
      </div>

      {preview && <PreviewView preview={preview} />}
    </div>
  );
}

export function PreviewView({ preview }: { preview: NoticePreview }) {
  return (
    <div className="a-card grid gap-3 p-4 text-sm" data-testid="notice-preview">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="muted">Platform</dt>
        <dd>{preview.platformName}</dd>
        <dt className="muted">Recipient</dt>
        <dd className="font-mono break-all">{preview.recipientEmail}</dd>
        <dt className="muted">Sent by</dt>
        <dd>email</dd>
        <dt className="muted">Subject</dt>
        <dd>{preview.subject}</dd>
        <dt className="muted">Notice date</dt>
        <dd>{preview.noticeDate}</dd>
        <dt className="muted">Signed as</dt>
        <dd className="font-mono">{preview.signedAs}</dd>
        <dt className="muted">Authorisation</dt>
        <dd>
          <span className="font-mono">{preview.consent.id}</span>, signed {formatTime(preview.consent.signedAt)}
        </dd>
      </dl>
      <div>
        <p className="eyebrow">PDF text, attached to the email (with the addresses)</p>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-[var(--line)] p-3 font-mono text-xs" tabIndex={0}>
          {preview.body}
        </pre>
        <button className="btn btn-secondary mt-2 px-3 py-1 text-xs" onClick={() => downloadPdf(preview)} type="button">
          Download the PDF
        </button>
      </div>
      <div>
        <p className="eyebrow">Email body, exactly as it will be sent (addresses replaced)</p>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-[var(--line)] p-3 font-mono text-xs" tabIndex={0}>
          {preview.emailBody}
        </pre>
      </div>
    </div>
  );
}
