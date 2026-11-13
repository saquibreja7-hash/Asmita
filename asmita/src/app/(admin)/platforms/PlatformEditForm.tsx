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
  verified: boolean;
  // When the contact was last changed in the console (null if never); sent
  // back on verify so a contact changed since the page loaded is refused.
  contactChangedAt: string | null;
  // True when the signed-in admin made the last contact change. They cannot
  // verify it; a second admin has to.
  changedByViewer: boolean;
};

const FIELDS = [
  { key: "grievanceEmail", label: "Grievance email", type: "email", placeholder: "go@example.com" },
  { key: "grievanceName", label: "GO name", type: "text", placeholder: "Full name from public source" },
  { key: "grievanceAddress", label: "GO postal address", type: "text", placeholder: "From the platform's public legal page" },
  { key: "formUrl", label: "Form URL", type: "url", placeholder: "https://example.com/report" },
  { key: "apiEndpoint", label: "API endpoint", type: "url", placeholder: "https://api.example.com/takedown" },
] as const;

export function PlatformEditForm({ platformId, platformName, current, verified, contactChangedAt, changedByViewer }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "edit" | "verify">("closed");
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

    const fields: Record<string, string | null> = {};
    for (const field of FIELDS) {
      const raw = formData.get(field.key);
      if (raw === null) continue;
      const value = String(raw).trim();
      const existing = current[field.key] ?? "";
      if (value === existing) continue;
      fields[field.key] = value === "" ? null : value;
    }

    if (Object.keys(fields).length === 0) {
      setError("No changes detected, nothing to save.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await csrfFetch(`/api/admin/platforms/${platformId}`, {
          method: "POST",
          body: JSON.stringify({ sourceUrl, fields }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Update failed (${res.status})`);
          return;
        }
        const result = await res.json();
        setSuccess(`Saved. ${result.changed ?? 0} field(s) changed. The contact is unverified until a second admin verifies it.`);
        setMode("closed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "network_error");
      }
    });
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const sourceUrl = String(new FormData(event.currentTarget).get("sourceUrl") || "").trim();
    if (!sourceUrl) {
      setError("Source URL is required so future auditors can see what you checked.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await csrfFetch(`/api/admin/platforms/${platformId}/verify`, {
          method: "POST",
          body: JSON.stringify({ sourceUrl, contactChangedAt }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(
            body.error === "second_admin_required"
              ? "You made the last change to this contact, so a different admin has to verify it."
              : body.error === "contact_changed"
                ? "This contact changed after the page loaded. Reload and check it again."
                : body.error || `Verification failed (${res.status})`,
          );
          return;
        }
        setSuccess("Contact marked verified.");
        setMode("closed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "network_error");
      }
    });
  }

  const messages = (
    <>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      {success ? <p className="text-xs text-[var(--brand)]">{success}</p> : null}
    </>
  );

  if (mode === "closed") {
    return (
      <div className="grid gap-2">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => {
              reset();
              setMode("edit");
            }}
            className="eyebrow text-[var(--brand)] underline-offset-4 hover:underline"
          >
            Edit
          </button>
          {changedByViewer ? null : (
            <button
              type="button"
              onClick={() => {
                reset();
                setMode("verify");
              }}
              className="eyebrow text-[var(--brand)] underline-offset-4 hover:underline"
            >
              Verify
            </button>
          )}
        </div>
        {changedByViewer && !verified ? (
          <p className="muted text-xs">You changed this contact. A second admin has to verify it.</p>
        ) : null}
        {messages}
      </div>
    );
  }

  if (mode === "verify") {
    return (
      <form
        onSubmit={handleVerify}
        className="mt-4 grid gap-3 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-4 text-sm"
        aria-label={`Verify grievance officer details for ${platformName}`}
      >
        <label className="grid gap-1">
          <span className="eyebrow">
            Source URL (required)
          </span>
          <input
            name="sourceUrl"
            type="url"
            required
            placeholder="https://help.platform.com/grievance-officer"
            className="font-mono rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] px-3 py-2 text-xs"
          />
          <span className="muted text-xs">
            Check every contact detail for this platform against its official public page, then link that page here.
          </span>
        </label>

        {messages}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary text-xs disabled:opacity-60"
          >
            {pending ? "Saving…" : "Mark contact verified"}
          </button>
          <button
            type="button"
            onClick={() => setMode("closed")}
            className="btn btn-secondary text-xs"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-3 a-card p-4 text-sm"
      aria-label={`Edit grievance officer details for ${platformName}`}
    >
      {FIELDS.map((field) => (
        <label key={field.key} className="grid gap-1">
          <span className="eyebrow">
            {field.label}
          </span>
          <input
            name={field.key}
            type={field.type}
            defaultValue={current[field.key] ?? ""}
            placeholder={field.placeholder}
            className="font-mono a-card px-3 py-2 text-xs"
          />
        </label>
      ))}

      <label className="grid gap-1">
        <span className="eyebrow">
          Source URL (required)
        </span>
        <input
          name="sourceUrl"
          type="url"
          required
          placeholder="https://help.platform.com/grievance-officer"
          className="font-mono a-card px-3 py-2 text-xs"
        />
        <span className="muted text-xs">
          Link to the official public page where you verified these details (legal page, transparency report, etc.).
        </span>
      </label>

      <p className="muted text-xs">
        Saving a change marks this contact unverified. A second admin then has to verify it before notices go there.
      </p>

      {messages}

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
          onClick={() => setMode("closed")}
          className="btn btn-secondary text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
