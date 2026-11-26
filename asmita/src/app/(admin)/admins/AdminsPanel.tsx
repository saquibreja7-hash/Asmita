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
 * rendered or sent, and no single-step email hash either: both actions
 * target the admin by an opaque key (the hash of the email hash), which
 * only the server resolves against the allowlist.
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
  already_admin: "That address is already an admin.",
  owner_managed_in_environment: "Owners are set in the server environment and cannot be changed here.",
  cannot_change_self: "You cannot change or remove your own access.",
  last_super_admin: "This is the last super admin. Add another super admin first.",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin (everything)",
  LEGAL_ADVISOR: "Legal advisor (templates, legal review)",
  CASE_REVIEWER: "Case reviewer (links, fingerprints, findings)",
  GO_EDITOR: "Grievance contacts editor (platforms)",
  SUPPORT_AGENT: "Support agent (read cases, add notes)",
};

/** Shows a just-issued enrolment code once, with the hand-over instructions. */
function IssuedCode({ code, who, onDone }: { code: string; who: string; onDone: () => void }) {
  return (
    <div className="mt-2 rounded-[var(--radius-box)] border border-[var(--line)] p-3 text-xs" role="status">
      <p>
        One-time enrolment code for <span className="font-mono">{who}</span>:
      </p>
      <p className="mt-1 font-mono text-base tracking-widest">{code}</p>
      <p className="muted mt-1">
        Hand it over out of band (in person or by phone, not by email). It is shown once and expires 24 hours after
        issue. They sign in at /admin with their email code plus this one, then set up their own authenticator.
      </p>
      <button className="link-underline mt-1" onClick={onDone} type="button">
        I have handed it over
      </button>
    </div>
  );
}

/** Add an admin by email and role; shows their enrolment code once. */
export function AddAdminForm() {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("CASE_REVIEWER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; who: string } | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (role === "SUPER_ADMIN" && !window.confirm(`Make ${email} a super admin? Super admins can do everything, including managing admins.`)) return;
    setBusy(true);
    setError(null);
    const result = await post("/api/admin/admins", { email, role });
    setBusy(false);
    const code = (result.body as { enrolmentCode?: string } | undefined)?.enrolmentCode;
    if (!result.ok || !code) {
      setError(inWords(result.error));
      return;
    }
    setIssued({ code, who: email });
    setEmail("");
    router.refresh();
  }

  return (
    <div className="a-card mt-4 p-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void add(event)}>
        <label className="text-sm">
          <span className="block font-medium">Email</span>
          <input
            className="mt-1 w-72 max-w-full rounded-[var(--radius-box)] border border-[var(--line)] px-3 py-2"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Role</span>
          <select
            className="mt-1 rounded-[var(--radius-box)] border border-[var(--line)] px-3 py-2"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary !m-0" disabled={busy || !email} type="submit">
          {busy ? "Adding…" : "Add admin"}
        </button>
      </form>
      {issued && <IssuedCode code={issued.code} who={issued.who} onDone={() => setIssued(null)} />}
      {error && <p className="mt-2 text-xs text-[var(--danger)]" role="alert">{error}</p>}
      {stepUpDialog}
    </div>
  );
}

/** Change a console admin's role, or remove them. Owners from the environment have no controls. */
export function AdminRoleControls({ targetKey, maskedEmail, role }: { targetKey: string; maskedEmail: string; role: string }) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [value, setValue] = useState(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change() {
    if (!window.confirm(`Change ${maskedEmail} to ${ROLE_LABELS[value] ?? value}?`)) return;
    setBusy(true);
    setError(null);
    const result = await post("/api/admin/admins", { adminKey: targetKey, role: value }, "PATCH");
    setBusy(false);
    if (!result.ok) setError(inWords(result.error));
    else router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Remove ${maskedEmail} as an admin? They lose access at once and their authenticator is cleared.`)) return;
    setBusy(true);
    setError(null);
    const result = await post("/api/admin/admins", { adminKey: targetKey }, "DELETE");
    setBusy(false);
    if (!result.ok) setError(inWords(result.error));
    else router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label={`Role for ${maskedEmail}`}
        className="rounded-[var(--radius-box)] border border-[var(--line)] px-2 py-1"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={busy}
      >
        {Object.entries(ROLE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <button className="btn btn-secondary !m-0 px-3 py-1 text-xs" disabled={busy || value === role} onClick={() => void change()} type="button">
        Change role
      </button>
      <button className="btn btn-secondary !m-0 px-3 py-1 text-xs text-[var(--danger)]" disabled={busy} onClick={() => void remove()} type="button">
        Remove
      </button>
      {error && <p className="w-full text-[var(--danger)]" role="alert">{error}</p>}
      {stepUpDialog}
    </div>
  );
}

function inWords(code: string | undefined): string {
  return ERRORS[code ?? ""] ?? "Nothing was changed: the request failed.";
}

/** Reset one admin's authenticator; shows the one-time enrolment code once. */
export function AdminResetButton({ targetKey, maskedEmail }: { targetKey: string; maskedEmail: string }) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string } | null>(null);

  async function reset() {
    // Resetting signs the admin out of their authenticator: ask first.
    if (!window.confirm(`Reset the authenticator for ${maskedEmail}? They cannot sign in until they enrol again with the code shown next.`)) return;
    setBusy(true);
    setError(null);
    const result: StepUpPostResult = await post("/api/admin/mfa/reset", { adminKey: targetKey });
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
  adminOptions: Array<{ targetKey: string; maskedEmail: string }>;
}) {
  const router = useRouter();
  const { post, stepUpDialog } = useStepUpPost();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const body: Record<string, unknown> = {};
    if (target.startsWith("role:")) body.role = target.slice(5);
    else if (target.startsWith("admin:")) body.adminKey = target.slice(6);
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
              <option key={admin.targetKey} value={`admin:${admin.targetKey}`}>
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
