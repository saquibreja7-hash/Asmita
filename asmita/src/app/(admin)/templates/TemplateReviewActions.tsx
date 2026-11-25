"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStepUpPost } from "../step-up-mfa";

const MESSAGES: Record<string, string> = {
  mfa_step_up_required: "Nothing was changed: this needs a fresh authenticator code.",
  already_reviewed: "This template already has a recorded review.",
  not_reviewed: "This template has no review to withdraw.",
  no_database: "No database in this environment, so nothing can be recorded.",
  invalid_payload: "Enter your name and confirm you read the full text.",
};

/*
 * Record or withdraw a legal review of one template. The reviewer reads the
 * full subject and body here, ticks that they did, and types their name; the
 * server also asks for a fresh authenticator code.
 */
export function TemplateReviewActions({
  templateId,
  reviewed,
  subject,
  body,
}: {
  templateId: string;
  reviewed: boolean;
  subject: string;
  body: string;
}) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(decision: "approve" | "withdraw") {
    setBusy(true);
    setMessage(null);
    const result = await post(`/api/admin/templates/${templateId}/legal-review`, {
      decision,
      reviewerName: name,
      confirmedReadFullText: read,
    });
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setRead(false);
      setMessage(decision === "approve" ? "Review recorded. The template can now be sent." : "Review withdrawn. The template is blocked again.");
      router.refresh();
    } else {
      setMessage(MESSAGES[result.error ?? ""] ?? "Nothing was changed. Please try again.");
    }
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button type="button" className="btn btn-secondary !m-0 !px-3 !py-1.5 text-xs" onClick={() => setOpen(true)}>
          {reviewed ? "Withdraw review" : "Read and review"}
        </button>
      ) : (
        <div className="a-card mt-2 p-4">
          <p className="eyebrow">Subject</p>
          <p className="mt-1 text-sm">{subject}</p>
          <p className="eyebrow mt-4">Full text</p>
          <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--radius-box)] border border-[var(--line)] p-3 text-xs leading-relaxed">{body}</pre>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-1" />
            <span>
              {reviewed
                ? "I want to withdraw this review. Notices using this template stop until it is reviewed again."
                : "I am the legal reviewer, I have read the full text above, and it may be sent."}
            </span>
          </label>
          <label className="mt-3 block text-sm">
            <span className="block font-medium">Reviewer name</span>
            <input
              className="mt-1 w-full max-w-sm rounded-[var(--radius-box)] border border-[var(--line)] px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary !m-0"
              disabled={busy || !read || name.trim().length < 2}
              onClick={() => submit(reviewed ? "withdraw" : "approve")}
            >
              {busy ? "Saving…" : reviewed ? "Withdraw review" : "Record legal review"}
            </button>
            <button type="button" className="btn btn-secondary !m-0" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      {stepUpDialog}
    </div>
  );
}
