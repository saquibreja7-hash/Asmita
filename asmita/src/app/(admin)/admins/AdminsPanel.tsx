"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStepUpPost, type StepUpPostResult } from "../step-up-mfa";

/*
 * The Admins page's client islands (review-console-spec.md WP144): the MFA
 * reset button (which issues the one-time enrolment code the existing
 * /api/admin/mfa/reset behaviour returns once) and the queue-access controls.
 * Both need a fresh authenticator code; the shared step-up dialog asks for
 * it and retries the original request. No full email address is ever
 * rendered or sent: the reset targets the admin's email hash, and the
 * access rows carry roles and hashes only.
 */

const ERRORS: Record<string, string> = {
  not_an_admin: "That admin is no longer on the allowlist.",
  admin_role_invalid: "That admin has no valid role (ADMIN_ROLES), so no code was issued.",
  invalid_payload: "That request was not understood. Reload and try again.",
  rate_limited: "Too many requests in a short time. Wait a moment, then try again.",
  csrf_failed: "Your session timed out. Reload the page and try again.",
  mfa_step_up_required: "Nothing was changed: this needs a fresh authenticator code.",
  request_failed: "Nothing was changed: the request failed.",
  permission_denied: "Your admin role cannot make this change.",
  queue_not_found: "That queue no longer exists. Reload the page.",
  protected_queue: "The protected queue ignores access rows.",
  queue_archived: "That queue is archived.",
  invalid_target: "Choose either one role or one admin.",
  access_row_not_found: "That row is already gone. Reload the page.",
};

function inWords(code: string | undefined): string {
  return ERRORS[code ?? ""] ?? "Nothing was changed: the request failed.";
}

/** Reset one admin's authenticator; shows the one-time enrolment code once. */
export function AdminResetButton({ emailHash, maskedEmail }: { emailHash: string; maskedEmail: string }) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string } | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    const result: StepUpPostResult = await post("/api/admin/mfa/reset", { emailHash });
    setBusy(false);
    if (!result.ok) {
      setError(inWords(result.error));
      return;
    }
    const body = result.body as { enrolmentCode?: string } | undefined;
    if (!body?.enrolmentCode) {
      setError(inWords("request_failed"));
      return;
    }
    setIssued({ code: body.enrolmentCode });
    router.refresh();
  }

  return (
    <div className="mt-3">
      <button
        className="btn btn-secondary px-3 py-1 text-xs"
        disabled={busy}
        onClick={() => void reset()}
        type="button"
      >
        {busy ? "Working…" : "Reset MFA"}
      </button>
      {issued && (
        <div className="mt-2 rounded-[var(--radius-box)] border border-[var(--line)] p-3 text-xs" role="status">
          <p>
            One-time enrolment code for <span className="font-mono">{maskedEmail}</span>:
          </p>
          <p className="mt-1 font-mono text-base tracking-widest">{issued.code}</p>
          <p className="muted mt-1">
            Hand it over out of band. It is shown once, and expires 24 hours after issue. The admin signs in with
            their email code plus this one, then enrols their own authenticator.
          </p>
          <button className="link-underline mt-1" onClick={() => setIssued(null)} type="button">
            I have handed it over
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {stepUpDialog}
    </div>
  );
}

/** Adds one access row to a queue: either one role or one admin. */
export function GrantAccessForm({
  queueId,
  queueName,
  roleOptions,
  adminOptions,
}: {
  queueId: string;
  queueName: string;
  roleOptions: string[];
  adminOptions: Array<{ emailHash: string; maskedEmail: string }>;
}) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const body: Record<string, unknown> = {};
    if (target.startsWith("role:")) body.role = target.slice(5);
    else if (target.startsWith("admin:")) body.adminEmailHash = target.slice(6);
    else {
      setError("Choose a role or an admin.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await post(`/api/admin/review/queues/${queueId}/access`, body);
    setBusy(false);
    if (!result.ok) {
      setError(inWords(result.error));
      return;
    }
    setTarget("");
    router.refresh();
  }

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <label className="grid gap-1">
        <span className="eyebrow">Add access for</span>
        <select
          aria-label={`Add access for ${queueName}`}
          className="field py-1 text-xs"
          onChange={(event) => setTarget(event.target.value)}
          value={target}
        >
          <option value="">(choose a role or an admin)</option>
          <optgroup label="One role">
            {roleOptions.map((role) => (
              <option key={role} value={`role:${role}`}>
                {role.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </optgroup>
          <optgroup label="One admin">
            {adminOptions.map((admin) => (
              <option key={admin.emailHash} value={`admin:${admin.emailHash}`}>
                {admin.maskedEmail}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy || target === ""} type="submit">
        {busy ? "Working…" : "Add"}
      </button>
      {error && (
        <p className="w-full text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {stepUpDialog}
    </form>
  );
}

/** Removes one access row from a queue. */
export function RevokeAccessButton({ queueId, accessId }: { queueId: string; accessId: string }) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await post(`/api/admin/review/queues/${queueId}/access/${accessId}`, {}, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(inWords(result.error));
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button className="link-underline text-xs" disabled={busy} onClick={() => void remove()} type="button">
        {busy ? "Removing…" : "Remove"}
      </button>
      {error && (
        <span className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </span>
      )}
      {stepUpDialog}
    </span>
  );
}
