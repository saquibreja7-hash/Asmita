"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { CaseNoteView } from "@/lib/case-notes";
import { formatIst } from "../case-format";

/*
 * The console's internal case notes (review-console-spec.md WP142): the
 * list, newest first, and the small form that writes one. Shown on the case
 * page and on the review job screen. A note is admin working memory only —
 * the form says so, and the server enforces it: notes are encrypted at
 * rest, never sent to a platform or a survivor, never in any export.
 *
 * Enter posts and Shift+Enter adds a line, per the spec. The server keeps
 * re-checking the permission and the length; this form only refuses what the
 * server would refuse anyway.
 */

const MAX = 2000;

const ERRORS: Record<string, string> = {
  permission_denied: "Your admin role cannot write case notes.",
  note_required: "Write the note first.",
  note_too_long: `The note is too long. ${MAX} characters at most.`,
  links_not_allowed: "Links cannot be posted in a note.",
  case_not_found: "This case no longer exists.",
  note_not_found: "That note no longer exists.",
  csrf_failed: "Your session timed out. Reload the page and try again.",
};

export function CaseNotes({
  caseId,
  jobId,
  notes,
  canNote,
}: {
  caseId: string | null;
  /** The review job the note is written from, on the job screen. */
  jobId?: string | null;
  notes: CaseNoteView[];
  canNote: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = body.trim();

  async function post() {
    if (busy || !trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch("/api/admin/case-notes", {
        method: "POST",
        body: JSON.stringify({ caseId, jobId: jobId ?? undefined, body: trimmed }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(ERRORS[data?.error ?? ""] ?? "Not saved. Reload and try again.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Not saved. Reload and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/admin/case-notes/${noteId}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(ERRORS[data?.error ?? ""] ?? "Not deleted. Reload and try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Not deleted. Reload and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 grid gap-3">
      {notes.length === 0 ? (
        <p className="muted text-sm">No notes yet.</p>
      ) : (
        <ul aria-label="Internal case notes" className="grid gap-2">
          {notes.map((note) => (
            <li className="a-card p-3 text-sm" key={note.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="eyebrow">{note.author}</p>
                <p className="muted flex items-baseline gap-3 tabular-nums text-xs">
                  {formatIst(note.createdAt)}
                  {note.canDelete && (
                    <button
                      className="link-underline text-xs"
                      disabled={busy}
                      onClick={() => void remove(note.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  )}
                </p>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{note.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canNote && caseId && (
        <div>
          <label className="grid gap-1" htmlFor="case-note-body">
            <span className="text-xs font-semibold">Add a note</span>
            <textarea
              aria-describedby="case-note-hint"
              className="field min-h-[64px] py-2 text-xs"
              id="case-note-body"
              maxLength={MAX}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                // Enter posts; Shift+Enter adds a line.
                if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                  event.preventDefault();
                  void post();
                }
              }}
              placeholder="What the next reviewer should know"
              rows={3}
              value={body}
            />
          </label>
          <p className="muted mt-1 flex flex-wrap items-baseline justify-between gap-2 text-[11px]" id="case-note-hint">
            <span>Internal only. Never sent to the survivor or a platform. Enter posts, Shift+Enter adds a line.</span>
            <span className="tabular-nums">{trimmed.length}/{MAX}</span>
          </p>
          <button
            className="btn btn-primary mt-2 px-3 py-1 text-xs"
            disabled={busy || !trimmed}
            onClick={() => void post()}
            type="button"
          >
            {busy ? "Saving…" : "Add note"}
          </button>
          {error && (
            <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
