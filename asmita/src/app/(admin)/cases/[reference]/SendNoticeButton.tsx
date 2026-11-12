"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

const ERRORS: Record<string, string> = {
  signature_required: "The survivor has not signed this notice.",
  url_not_ready_for_dispatch: "This link is not approved for sending, or was already sent.",
  url_expired: "This link passed the retention period and was deleted.",
  verified_platform_contact_required: "The platform has no human-verified contact.",
  platform_not_dispatchable: "The platform is inactive.",
  email_notice_not_supported: "This platform takes reports only through its own form.",
  reviewed_template_required: "No legally reviewed template is active for this platform.",
  notice_template_requires_review: "The template needs legal review before it can be sent.",
  fingerprints_pending_review: "Fingerprints in the signed notice still need review.",
  signed_fingerprints_changed: "A fingerprint in the signed notice was rejected. The survivor must sign again.",
  email_already_sent: "This notice was already emailed. Nothing was sent again.",
  platform_api_failed: "The platform API rejected the notice and no verified email contact exists.",
  platform_api_ambiguous: "The platform API failed ambiguously (timeout, network or 5xx). Nothing was emailed. Retry to re-send the same idempotent request.",
  platform_api_not_configured: "The platform API channel lost its token. Nothing was sent.",
  permission_denied: "Your admin role cannot send notices.",
};

type Props = {
  caseId: string;
  urlId: string;
  platformName: string;
  recipient: string;
  transport: "api" | "email";
  templateLabel: string;
  reviewLabel: string;
  fingerprintCount: number;
};

export function SendNoticeButton(props: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const titleId = `send-notice-${props.urlId}`;

  async function send() {
    setState("sending");
    setError(null);
    try {
      const response = await csrfFetch("/api/notices/dispatch", {
        method: "POST",
        body: JSON.stringify({ caseId: props.caseId, urlId: props.urlId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(ERRORS[body?.error ?? ""] ?? `Not sent (${body?.error ?? `status ${response.status}`}).`);
        setState("idle");
        return;
      }
      setState("sent");
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("Not sent: the request failed. Nothing was emailed.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p className="text-sm text-[var(--brand)]" role="status">
        Notice sent to {props.platformName}.
      </p>
    );
  }

  return (
    <>
      <button className="btn btn-primary px-3 py-1 text-xs" onClick={() => dialogRef.current?.showModal()} type="button">
        Send notice
      </button>
      <dialog
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setError(null)}
        ref={dialogRef}
      >
        <h2 id={titleId}>
          Send notice to {props.platformName}
        </h2>
        <p className="mt-3 text-sm">
          {props.transport === "api"
            ? "This sends a legal notice in the survivor's name to the platform's reporting API, with the PDF they signed included. It cannot be unsent."
            : "This emails a legal notice in the survivor's name, with the PDF they signed attached. It cannot be unsent."}
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="muted">Channel</dt>
          <dd>{props.transport === "api" ? "Platform API" : "Email"}</dd>
          <dt className="muted">Recipient</dt>
          <dd className="font-mono break-all">{props.recipient}</dd>
          <dt className="muted">Template</dt>
          <dd>{props.templateLabel}</dd>
          <dt className="muted">Legal review</dt>
          <dd>{props.reviewLabel}</dd>
          <dt className="muted">Fingerprints</dt>
          <dd>
            {props.fingerprintCount === 0
              ? "None in the signed notice"
              : `${props.fingerprintCount} in the signed notice`}
          </dd>
        </dl>
        {error && (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {/* Cancel takes focus first: the least destructive choice. */}
          <button autoFocus className="btn btn-secondary" onClick={() => dialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={state === "sending"} onClick={send} type="button">
            {state === "sending" ? "Sending…" : `Send notice to ${props.platformName}`}
          </button>
        </div>
      </dialog>
    </>
  );
}
