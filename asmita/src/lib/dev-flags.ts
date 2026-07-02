// Dev bypass flags open safety gates (legal review of outbound notices,
// admin MFA). They exist for local development only and must stay inert in
// production builds even if the env var is accidentally set on the host.
export function devFlagEnabled(
  name: "DEV_SKIP_LEGAL_REVIEW" | "DEV_SKIP_ADMIN_MFA",
) {
  if (process.env.NODE_ENV === "production") return false;
  return process.env[name] === "true";
}
