"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

type Props = {
  platformId: string;
  platformName: string;
  current: {
    grievanceEmail: string | null;
    grievanceName: string | null;
    grievanceAddress: string | null;
    formUrl: string | null;
    apiEndpoint: string | null;
  };
};

const FIELDS = [
  { key: "grievanceEmail", label: "Grievance email", type: "email", placeholder: "go@example.com" },
  { key: "grievanceName", label: "GO name", type: "text", placeholder: "Full name from public source" },
  { key: "grievanceAddress", label: "GO postal address", type: "text", placeholder: "From the platform's public legal page" },
  { key: "formUrl", label: "Form URL", type: "url", placeholder: "https://example.com/report" },
  { key: "apiEndpoint", label: "API endpoint", type: "url", placeholder: "https://api.example.com/takedown" },
] as const;

export function PlatformEditForm({ platformId, platformName, current }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const formData = new FormData(event.currentTarget);
    const sourceUrl = String(formData.get("sourceUrl") || "").trim();
    if (!sourceUrl) {
      setError("Source URL is required so future auditors can verify this change.");
      return;
    }
    const markVerified = formData.get("markVerified") === "on";

    const fields: Record<string, string | null> = {};
    for (const field of FIELDS) {
      const raw = formData.get(field.key);
      if (raw === null) continue;
      const value = String(raw).trim();
      const existing = current[field.key] ?? "";
      if (value === existing) continue;
      fields[field.key] = value === "" ? null : value;
    }

    if (Object.keys(fields).length === 0 && !markVerified) {
      setError("No changes detected and 'mark verified' not selected - nothing to save.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await csrfFetch(`/api/admin/platforms/${platformId}`, {
          method: "POST",
          body: JSON.stringify({ sourceUrl, markVerified, fields }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Update failed (${res.status})`);
          return;
        }
        const result = await res.json();
        setSuccess(`Saved. ${result.changed ?? 0} field(s) changed${result.markVerified ? "; re-verification timestamp updated" : ""}.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "network_error");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] underline-offset-4 hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-3 rounded-[12px] border border-[var(--hairline)] bg-[var(--background)] p-4 text-sm"
      aria-label={`Edit grievance officer details for ${platformName}`}
    >
      {FIELDS.map((field) => (
        <label key={field.key} className="grid gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {field.label}
          </span>
          <input
            name={field.key}
            type={field.type}
            defaultValue={current[field.key] ?? ""}
            placeholder={field.placeholder}
            className="font-mono rounded border border-[var(--hairline)] bg-white px-3 py-2 text-xs"
          />
        </label>
      ))}

      <label className="grid gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Source URL (required)
        </span>
        <input
          name="sourceUrl"
          type="url"
          required
          placeholder="https://help.platform.com/grievance-officer"
          className="font-mono rounded border border-[var(--hairline)] bg-white px-3 py-2 text-xs"
        />
        <span className="muted text-xs">
          Link to the official public page where you verified these details (legal page, transparency report, etc.).
        </span>
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="markVerified" defaultChecked />
        <span>Mark contact verified by human (sets last-verified timestamp)</span>
      </label>

      {error ? <p className="text-xs text-[var(--rose)]">{error}</p> : null}
      {success ? <p className="text-xs text-[var(--accent)]">{success}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary text-xs disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save change"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-secondary text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
