// Dev bypass flags open safety gates (legal review of outbound notices,
// admin MFA). They exist for local development only and must stay inert in
// production builds even if the env var is accidentally set on the host.
export function devFlagEnabled(
  name: "DEV_SKIP_LEGAL_REVIEW" | "DEV_SKIP_ADMIN_MFA",
) {
  if (process.env.NODE_ENV === "production") return false;
  return process.env[name] === "true";
}

// The server-side provenance check (/api/check-image) sends the image to
// OpenAI. Owner decision, 19 November 2026: this one route is allowed to
// run in production when ENABLE_PROVENANCE_CHECK=true ("Decision recorded"
// in docs/adr/002-consented-encrypted-media.md — the evidence-vault part of
// ADR 002 stays blocked on legal sign-off). The gates stay: adults-only and
// an explicit per-check consent tick, both enforced in the route, nothing
// stored or logged, and OPENAI_API_KEY set only as a Worker secret (the
// route answers "not configured" without it).
export function provenanceCheckEnabled() {
  return process.env.ENABLE_PROVENANCE_CHECK === "true";
}
