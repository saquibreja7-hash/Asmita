/*
 * WP94 (docs/lab/beta-spec.md): the stamp tool's configuration, from the
 * environment. The signing key is a Lab test certificate in
 * LAB_C2PA_CERT / LAB_C2PA_KEY (PEM); without both, the page explains that
 * signing is not configured and offers nothing, and the API refuses with
 * signing_not_configured. A key is never committed and never logged — this
 * module only ever answers whether one is present and well-formed.
 *
 * Deliberately separate from engine.ts: the page needs this check without
 * touching the WebAssembly engine.
 */

/** The site-wide daily cap for this tool; LAB_STAMP_DAILY_LIMIT, default 200. */
export function stampDailyLimit() {
  const value = Number(process.env.LAB_STAMP_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : 200;
}

export type StampSigningConfig = { cert: string; key: string };

/** Both PEM blocks when the environment carries a usable signing pair. */
export function stampSigningConfig(env: Record<string, string | undefined> = process.env): StampSigningConfig | null {
  const cert = env.LAB_C2PA_CERT;
  const key = env.LAB_C2PA_KEY;
  if (!cert || !key) return null;
  return { cert, key };
}

/** True exactly when stamping can run — all the page needs to know. */
export function stampSigningConfigured(env: Record<string, string | undefined> = process.env) {
  return stampSigningConfig(env) !== null;
}
