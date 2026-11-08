"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { SavedView } from "@/lib/admin-saved-views";

const ERRORS: Record<string, string> = {
  name_taken: "You already have a view with that name.",
  too_many_views: "You have 20 saved views. Remove one first.",
  empty_view: "Choose a filter or sort before saving.",
  links_not_allowed: "A view cannot contain a link. Remove it from the name or search.",
};

/** The admin's own saved filters: open, remove, or save the current one. */
export function SavedViews({ views, currentQuery }: { views: SavedView[]; currentQuery: string }) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadySaved = views.some((view) => view.query === currentQuery);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch("/api/admin/views", {
        method: "POST",
        body: JSON.stringify({ name, query: currentQuery }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(ERRORS[body?.error ?? ""] ?? "The view was not saved.");
        return;
      }
      setNaming(false);
      setName("");
      router.refresh();
    } catch {
      setError("The view was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(view: SavedView) {
    setError(null);
    const response = await csrfFetch(`/api/admin/views/${view.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) setError(`"${view.name}" was not removed.`);
    router.refresh();
  }

  if (views.length === 0 && !currentQuery) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {views.length > 0 && <span className="muted text-xs">My views:</span>}
      {views.map((view) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
            view.query === currentQuery ? "border-[var(--ink)]" : "border-[var(--line)]"
          }`}
          key={view.id}
        >
          <Link aria-current={view.query === currentQuery ? "page" : undefined} href={`/admin/cases?${view.query}`}>
            {view.name}
          </Link>
          <button
            aria-label={`Remove saved view ${view.name}`}
            className="text-[var(--text-muted)]"
            onClick={() => remove(view)}
            type="button"
          >
            ×
          </button>
        </span>
      ))}
      {currentQuery && !alreadySaved && !naming && (
        <button className="link-underline text-xs" onClick={() => setNaming(true)} type="button">
          Save this view
        </button>
      )}
      {naming && (
        <form className="flex items-center gap-2" onSubmit={save}>
          <label className="sr-only" htmlFor="saved-view-name">
            Name for this view
          </label>
          <input
            autoFocus
            className="field py-1 text-sm"
            id="saved-view-name"
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="View name"
            required
            value={name}
          />
          <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy || !name.trim()} type="submit">
            Save
          </button>
          <button className="link-underline text-xs" onClick={() => setNaming(false)} type="button">
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p className="w-full text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
