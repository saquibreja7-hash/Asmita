"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { PartnerStatus } from "@/lib/platform-partners-shared";

/** What the console passes per request: no contact details reach the client. */
export type ApplicationActionView = {
  id: string;
  platformName: string;
  websiteDomain: string;
  status: PartnerStatus;
};

const STATUS_TEXT: Record<PartnerStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  ONBOARDED: "Onboarded",
  DECLINED: "Declined",
};

const APPLICATION_ERRORS: Record<string, string> = {
  application_not_found: "This request no longer exists.",
  invalid_status: "The request was already updated. Refresh to see its current state.",
  partner_exists: "A platform partner already exists for that domain.",
  invalid_payload: "Not saved — check the request and try again.",
};

async function act(
  applicationId: string,
  action: "contacted" | "approve" | "decline",
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await csrfFetch("/api/admin/partners/applications/" + applicationId, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      message: APPLICATION_ERRORS[data?.error ?? ""] ?? `Not saved (${data?.error ?? `status ${response.status}`}).`,
    };
  } catch {
    return { ok: false, message: "Not saved: the request failed." };
  }
}

// Act on requests to join the partner programme. The buttons carry only the
// platform's name and domain — the contact details stay on the server.
export function ApplicationsManager({ applications }: { applications: ApplicationActionView[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<ApplicationActionView | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "decline" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function markContacted(application: ApplicationActionView) {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await act(application.id, "contacted");
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice(`${application.platformName} marked contacted.`);
    router.refresh();
  }

  function openDialog(application: ApplicationActionView, action: "approve" | "decline") {
    setPending(application);
    setPendingAction(action);
    setError(null);
    setNotice(null);
    setDialogError(null);
    dialogRef.current?.showModal();
  }

  async function confirmDialog() {
    if (!pending || !pendingAction) return;
    setBusy(true);
    const result = await act(pending.id, pendingAction);
    setBusy(false);
    if (!result.ok) return setDialogError(result.message);
    dialogRef.current?.close();
    setNotice(
      pendingAction === "approve"
        ? `${pending.platformName} approved — the platform partner is created.`
        : `${pending.platformName} declined.`,
    );
    setPending(null);
    setPendingAction(null);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <h2>Actions</h2>
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>
      <ul className="grid gap-2">
        {applications.map((application) => (
          <li className="a-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm" key={application.id}>
            <span className="min-w-0">
              <span className="font-semibold">{application.platformName}</span>{" "}
              <span className="muted font-mono">{application.websiteDomain}</span>
            </span>
            {application.status === "NEW" || application.status === "CONTACTED" ? (
              <span className="flex flex-wrap gap-2">
                {application.status === "NEW" && (
                  <button
                    aria-label={`Mark ${application.platformName} contacted`}
                    className="btn btn-secondary px-3 py-1 text-xs"
                    disabled={busy}
                    onClick={() => markContacted(application)}
                    type="button"
                  >
                    Mark contacted
                  </button>
                )}
                <button
                  aria-label={`Approve ${application.platformName}`}
                  className="btn btn-primary px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() => openDialog(application, "approve")}
                  type="button"
                >
                  Approve…
                </button>
                <button
                  aria-label={`Decline ${application.platformName}`}
                  className="btn btn-secondary px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() => openDialog(application, "decline")}
                  type="button"
                >
                  Decline…
                </button>
              </span>
            ) : (
              <span className="a-nowrap">{STATUS_TEXT[application.status]}</span>
            )}
          </li>
        ))}
      </ul>
      <dialog
        aria-labelledby="application-action-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setDialogError(null)}
        ref={dialogRef}
      >
        <h2 id="application-action-title">
          {pendingAction === "decline" ? "Decline" : "Approve"} {pending?.platformName ?? "this request"}?
        </h2>
        <p className="mt-3 text-sm">
          Approving creates the platform partner and marks this request onboarded; it does not share anything by
          itself. Declining marks the request declined, and no platform partner is created. A partner API key is
          issued separately, and crawler monitoring starts only after the platform&apos;s written permission is
          recorded.
        </p>
        {dialogError && (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {dialogError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button autoFocus className="btn btn-secondary" onClick={() => dialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={confirmDialog} type="button">
            {busy ? "Saving…" : pendingAction === "decline" ? "Decline" : "Approve"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
