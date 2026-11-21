// One home for every cookie name Asmita sets, reads or clears.
//
// In production the session and CSRF cookies carry the __Host- prefix, which
// the browser only accepts for Secure cookies scoped to Path=/ with no Domain
// attribute: a cookie planted through any other path, subdomain or sibling
// host can therefore never shadow or pre-seed a real session. Dev and test
// serve http://localhost, where the prefix is impossible (it requires Secure),
// so they keep the plain names.

const HOST_PREFIX = "__Host-";

/** Wire names. The three auth cookies gain the __Host- prefix in production. */
export const COOKIE_BASE_NAMES = {
  session: "asmita_session",
  adminSession: "asmita_admin_session",
  csrf: "asmita_csrf",
  language: "asmita_lang",
  eligibleAdult: "asmita_eligible",
  adminLinksSeen: "asmita_admin_links_seen",
} as const;

function hostPrefixed(base: string) {
  return process.env.NODE_ENV === "production" ? `${HOST_PREFIX}${base}` : base;
}

/** The survivor session cookie (httpOnly, set by /api/auth/verify-otp). */
export function sessionCookieName() {
  return hostPrefixed(COOKIE_BASE_NAMES.session);
}

/** The admin session cookie (httpOnly, set by the admin sign-in routes). */
export function adminSessionCookieName() {
  return hostPrefixed(COOKIE_BASE_NAMES.adminSession);
}

/** The CSRF nonce cookie (httpOnly, set by GET /api/csrf). */
export function csrfCookieName() {
  return hostPrefixed(COOKIE_BASE_NAMES.csrf);
}

// 2026-11-20, one release only: sessions and CSRF cookies minted before the
// __Host- migration still arrive under the plain names. Readers accept both
// names until the next release, and every logout clears both. Victim sessions
// last 4 hours, admin sessions 8 and the CSRF cookie 1, so no pre-migration
// cookie can arrive after 2026-11-21; remove withLegacyFallback and its
// callers in the next release after that.
export function withLegacyFallback(name: string): string[] {
  return name.startsWith(HOST_PREFIX) ? [name, name.slice(HOST_PREFIX.length)] : [name];
}

/**
 * Looks a cookie up by its current name, accepting the legacy name for one
 * release (see the dated note above). `get` is next/headers' cookie store or
 * any equivalent lookup; the current name is always read first.
 */
export function readCookieWithFallback(
  get: (name: string) => { value?: string } | undefined | null,
  name: string,
): string | undefined {
  for (const candidate of withLegacyFallback(name)) {
    const found = get(candidate);
    if (found && found.value !== undefined) return found.value;
  }
  return undefined;
}
