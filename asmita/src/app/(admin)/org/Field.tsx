"use client";

// One labelled form control for the org admin managers, with optional hint
// and error lines. Same shape as the crawl-sources Field, but the hint may
// be omitted.

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p className="muted text-xs" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
