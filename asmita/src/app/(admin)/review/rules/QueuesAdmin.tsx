"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

/*
 * The queues admin (review-console-spec.md WP143, point 6): SUPER_ADMIN adds
 * custom queues per kind, renames them, and archives empty ones. System
 * queues cannot be archived and the protected minor-hold queue cannot be
 * edited; the server refuses all of it again. Only queue configuration is
 * shown here — counts and labels, never a subject's data.
 */

export type QueueAdminView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kindLabel: string;
  isDefault: boolean;
  protected: boolean;
  pending: number;
  archived: boolean;
  sortOrder: number;
  requireReasonOnReject: boolean;
  requireReasonOnApprove: boolean;
  /** A custom, empty, unarchived queue the rules do not point at. */
  canArchive: boolean;
  editable: boolean;
};

const KIND_OPTIONS = ["FLAGGED_LINK", "FINGERPRINT", "FINDING", "PARTNER_APPLICATION", "LAB_REPORT"] as const;

const KIND_LABELS: Record<string, string> = {
  FLAGGED_LINK: "Flagged links",
  FINGERPRINT: "Fingerprints",
  FINDING: "Crawler findings",
  PARTNER_APPLICATION: "Partner applications",
  LAB_REPORT: "Lab reports",
};

const ERRORS: Record<string, string> = {
  invalid_payload: "That change was not understood. Check the fields and try again.",
  invalid_name: "Give the queue a name.",
  invalid_description: "Keep the description shorter.",
  invalid_sort_order: "Sort order is a whole number.",
  links_not_allowed: "Names and descriptions cannot contain an address.",
  queue_key_exists: "A queue with a name like this already exists. Choose another name.",
  queue_not_found: "That queue no longer exists. Reload the page.",
  protected_queue: "The protected queue cannot be edited or archived.",
  system_queue: "System queues cannot be edited or archived.",
  queue_archived: "This queue is archived.",
  queue_not_empty: "Only an empty queue can be archived.",
  queue_in_use: "A routing rule still points at this queue. Retarget the rule first.",
  rate_limited: "Too many changes in a short time. Wait a moment, then try again.",
  csrf_failed: "Your session timed out. Reload the page and try again.",
  request_failed: "Not saved. Reload the page and try again.",
};

function inWords(code: string | undefined): string {
  return ERRORS[code ?? ""] ?? "Not saved. Reload the page and try again.";
}

async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await csrfFetch(path, { method: "POST", body: JSON.stringify(body) });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.ok) return { ok: true };
    return { ok: false, error: data?.error ?? "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

function AddQueueForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]>("FLAGGED_LINK");
  const [requireReasonOnReject, setRequireReasonOnReject] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await post("/api/admin/review/queues", {
      name: name.trim(),
      description: description.trim() || null,
      subjectKind: kind,
      requireReasonOnReject,
    });
    setBusy(false);
    if (!result.ok) {
      setError(inWords(result.error));
      return;
    }
    setName("");
    setDescription("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen(true)} type="button">
        Add a queue
      </button>
    );
  }
  return (
    <div className="a-card mt-3 grid gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Name</span>
          <input className="field py-1.5 text-xs" maxLength={80} onChange={(event) => setName(event.target.value)} type="text" value={name} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold">For kind</span>
          <select className="field py-1 text-xs" onChange={(event) => setKind(event.target.value as (typeof KIND_OPTIONS)[number])} value={kind}>
            {KIND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 sm:max-w-md">
        <span className="text-xs font-semibold">Description (optional)</span>
        <input className="field py-1.5 text-xs" maxLength={240} onChange={(event) => setDescription(event.target.value)} type="text" value={description} />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input checked={requireReasonOnReject} onChange={(event) => setRequireReasonOnReject(event.target.checked)} type="checkbox" />
        Reviewers must pick a reason on a rejection
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void save()} type="button">
          {busy ? "Saving…" : "Add queue"}
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)} type="button">
          Cancel
        </button>
        <span className="muted text-xs">Its key is derived from the name and never changes.</span>
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EditQueueForm({ queue, onClose }: { queue: QueueAdminView; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(queue.name);
  const [description, setDescription] = useState(queue.description ?? "");
  const [sortOrder, setSortOrder] = useState(queue.sortOrder);
  const [requireReasonOnReject, setRequireReasonOnReject] = useState(queue.requireReasonOnReject);
  const [requireReasonOnApprove, setRequireReasonOnApprove] = useState(queue.requireReasonOnApprove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await post(`/api/admin/review/queues/${queue.id}`, {
      name: name.trim(),
      description: description.trim() || null,
      sortOrder,
      requireReasonOnReject,
      requireReasonOnApprove,
    });
    setBusy(false);
    if (!result.ok) {
      setError(inWords(result.error));
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="a-card mt-2 grid gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Name</span>
          <input className="field py-1.5 text-xs" maxLength={80} onChange={(event) => setName(event.target.value)} type="text" value={name} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Sort order</span>
          <input
            className="field py-1.5 text-xs"
            max={100000}
            min={0}
            onChange={(event) => setSortOrder(Number(event.target.value))}
            type="number"
            value={sortOrder}
          />
        </label>
      </div>
      <label className="grid gap-1 sm:max-w-md">
        <span className="text-xs font-semibold">Description (optional)</span>
        <input className="field py-1.5 text-xs" maxLength={240} onChange={(event) => setDescription(event.target.value)} type="text" value={description} />
      </label>
      <div className="flex flex-wrap gap-6 text-xs">
        <label className="flex items-center gap-2">
          <input checked={requireReasonOnReject} onChange={(event) => setRequireReasonOnReject(event.target.checked)} type="checkbox" />
          Reason required on rejection
        </label>
        <label className="flex items-center gap-2">
          <input checked={requireReasonOnApprove} onChange={(event) => setRequireReasonOnApprove(event.target.checked)} type="checkbox" />
          Reason required on approval
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void save()} type="button">
          {busy ? "Saving…" : "Save queue"}
        </button>
        <button className="btn btn-secondary" onClick={onClose} type="button">
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function QueueRow({ queue }: { queue: QueueAdminView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function archive() {
    setError(null);
    const result = await post(`/api/admin/review/queues/${queue.id}/archive`, {});
    if (!result.ok) setError(inWords(result.error));
    else {
      setConfirming(false);
      router.refresh();
    }
  }

  return (
    <li className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium">{queue.name}</span>
          <span className="muted font-mono text-xs">{queue.key}</span>
          {queue.isDefault && <span className="a-chip text-xs">Default</span>}
          {queue.protected && <span className="a-chip text-xs">Protected</span>}
          {!queue.isDefault && !queue.protected && <span className="a-chip text-xs">Custom</span>}
          {queue.archived && <span className="a-chip text-xs">Archived</span>}
        </p>
        {queue.description && <p className="muted mt-0.5 text-xs">{queue.description}</p>}
        <p className="muted mt-0.5 text-xs">
          {queue.kindLabel} · sort {queue.sortOrder}
          {queue.requireReasonOnReject ? " · reason on rejection" : ""}
          {queue.requireReasonOnApprove ? " · reason on approval" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="muted a-nowrap text-xs">
          {queue.pending === 0 ? "No open items" : `${queue.pending} open`}
        </span>
        {queue.editable && !queue.archived && (
          <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setEditing((open) => !open)} type="button">
            {editing ? "Close" : "Edit"}
          </button>
        )}
        {queue.canArchive && !confirming && (
          <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setConfirming(true)} type="button">
            Archive
          </button>
        )}
        {queue.canArchive && confirming && (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            Archive this empty queue?
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => void archive()} type="button">
              Archive
            </button>
            <button className="link-underline text-xs" onClick={() => setConfirming(false)} type="button">
              Keep it
            </button>
          </span>
        )}
        {!queue.editable && !queue.archived && (
          <span className="muted text-xs">{queue.protected ? "Not editable" : "System queue"}</span>
        )}
      </div>
      {editing && <div className="md:col-span-2"><EditQueueForm queue={queue} onClose={() => setEditing(false)} /></div>}
      {error && (
        <p className="text-xs text-[var(--danger)] md:col-span-2" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export function QueuesAdmin({ queues }: { queues: QueueAdminView[] }) {
  return (
    <div>
      <AddQueueForm />
      <ul aria-label="Review queues" className="a-card mt-4 divide-y divide-[var(--line)]">
        {queues.map((queue) => (
          <QueueRow key={queue.id} queue={queue} />
        ))}
      </ul>
    </div>
  );
}
