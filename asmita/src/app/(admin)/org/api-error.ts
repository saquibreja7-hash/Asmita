// Shared API error sentences for the org admin managers: the answers every
// /api/admin/org route can give, plus the page's own map for its domain
// errors (slug_taken, case_study_checks_required, …).

const COMMON: Record<string, string> = {
  csrf_failed: "The request was refused — the security token expired. Try again.",
  rate_limited: "Too many changes just now; wait a moment and try again.",
  payload_too_large: "That is too long to send.",
};

export function apiError(
  data: { error?: string; field?: string } | null,
  messages: Record<string, string>,
  fallback: string,
): string {
  const error = data?.error;
  if (!error) return fallback;
  if (error === "invalid_payload") {
    return data?.field ? `Not saved — check the ${data.field} field.` : "Not saved — check the fields.";
  }
  return messages[error] ?? COMMON[error] ?? `Not saved (${error}).`;
}
