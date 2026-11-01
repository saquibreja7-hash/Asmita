// Dev bypass flags open safety gates (legal review of outbound notices,
// admin MFA). They exist for local development only and must stay inert in
// production builds even if the env var is accidentally set on the host.
export function devFlagEnabled(
  name: "DEV_SKIP_LEGAL_REVIEW" | "DEV_SKIP_ADMIN_MFA",
) {
  if (process.env.NODE_ENV === "production") return false;
  return process.env[name] === "true";
}

// The server-side provenance check sends survivor images to OpenAI. ADR 002
// (consented media) is blocked on legal sign-off, so production builds keep
// it off even if ENABLE_PROVENANCE_CHECK=true is set on the host. Remove the
// production check in the same change that marks ADR 002 accepted.
export function provenanceCheckEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ENABLE_PROVENANCE_CHECK === "true";
}
