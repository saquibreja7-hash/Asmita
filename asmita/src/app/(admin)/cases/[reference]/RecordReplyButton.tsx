"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

type Reply = "ACKNOWLEDGED" | "REMOVED" | "REJECTED";

const OPTIONS: Array<[Reply, string, string]> = [
  ["REMOVED", "Removed", "The content is gone. This stops the escalation ladder for this link."],
  ["ACKNOWLEDGED", "Acknowledged, not removed yet", "Asmita will not send the 24-hour follow-up. The survivor's next steps stay open."],
  ["REJECTED", "Refused", "Asmita will not send the follow-up. The survivor can complain to the cybercrime portal and appeal to the GAC now."],
];

const ERRORS: Record<string, string> = {
  already_removed: "This link is already recorded as removed.",
  reply_in_future: "The reply time is in the future.",
  reply_before_notice: "The reply time is before the notice was sent.",
  follow_up_notice: "Record the reply on the original notice.",
  notice_not_sent: "This notice was never sent.",
  permission_denied: "Your admin role cannot record replies.",
};

/** A datetime-local value for now, in the browser's time zone. */
function localNow() {
  const date = new Date();
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function RecordReplyButton({ noticeId, platformName }: { noticeId: string; platformName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reply, setReply] = useState<Reply | "">("");
  const [receivedAt, setReceivedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const titleId = `record-reply-${noticeId}`;

  function open() {
    setReply("");
    setReceivedAt(localNow());
    setError(null);
    dialogRef.current?.showModal();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!reply || !receivedAt) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/admin/notices/${noticeId}/response`, {
        method: "POST",
        body: JSON.stringify({ responseType: reply, receivedAt: new Date(receivedAt).toISOString() }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(ERRORS[body?.error ?? ""] ?? `Not recorded (${body?.error ?? `status ${response.status}`}).`);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("Not recorded: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-secondary px-3 py-1 text-xs" onClick={open} type="button">
        Record reply
      </button>
      <dialog
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-6 text-[var(--ink)] backdrop:bg-black/40"
        ref={dialogRef}
      >
        <form onSubmit={save}>
          <h2 className="subsection-title" id={titleId}>
            Record {platformName}&apos;s reply
          </h2>
          <fieldset className="mt-4 grid gap-3">
            <legend className="eyebrow">What did the platform do?</legend>
            {OPTIONS.map(([value, label, help]) => (
              <label className="flex gap-3 text-sm" key={value}>
                <input
                  checked={reply === value}
                  name={`reply-${noticeId}`}
                  onChange={() => setReply(value)}
                  required
                  type="radio"
                  value={value}
                />
                <span>
                  {label}
                  <span className="muted block text-xs">{help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="mt-4 grid gap-1.5 text-sm" htmlFor={`reply-at-${noticeId}`}>
            <span className="eyebrow">When did the reply arrive?</span>
            <input
              className="field"
              id={`reply-at-${noticeId}`}
              max={localNow()}
              onChange={(event) => setReceivedAt(event.target.value)}
              required
              type="datetime-local"
              value={receivedAt}
            />
          </label>
          {error && (
            <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button autoFocus className="btn btn-secondary" onClick={() => dialogRef.current?.close()} type="button">
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy || !reply} type="submit">
              {busy ? "Saving…" : "Record reply"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
