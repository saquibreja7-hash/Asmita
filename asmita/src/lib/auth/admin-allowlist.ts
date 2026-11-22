import { hashEmail } from "@/lib/hash";
import type { AdminRole } from "@/lib/auth/admin-permissions";

const ADMIN_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "LEGAL_ADVISOR",
  "CASE_REVIEWER",
  "GO_EDITOR",
  "SUPPORT_AGENT",
]);

export type AdminRoleResolution =
  | { ok: true; role: AdminRole }
  | { ok: false; reason: "not_allowlisted" | "role_missing" | "role_unknown" };

function envList(name: "ADMIN_EMAILS" | "ADMIN_ROLES") {
  return (process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * The admin's role as configured right now, looked up by email hash so a
 * session (which carries only the hash) can be checked on every request.
 * Every admin needs both an ADMIN_EMAILS entry and an ADMIN_ROLES entry,
 * ADMIN_ROLES="founder@example.org=SUPER_ADMIN,legal@example.org=LEGAL_ADVISOR".
 * A missing or unrecognised role grants nothing; the first ADMIN_ROLES entry
 * for an email decides.
 */
export function resolveAdminRoleByHash(emailHash: string): AdminRoleResolution {
  if (!emailHash || !envList("ADMIN_EMAILS").some((email) => hashEmail(email) === emailHash)) {
    return { ok: false, reason: "not_allowlisted" };
  }
  for (const entry of envList("ADMIN_ROLES")) {
    const [entryEmail, role] = entry.split("=").map((part) => part?.trim());
    if (!entryEmail || hashEmail(entryEmail) !== emailHash) continue;
    if (!role) return { ok: false, reason: "role_missing" };
    return ADMIN_ROLES.has(role) ? { ok: true, role: role as AdminRole } : { ok: false, reason: "role_unknown" };
  }
  return { ok: false, reason: "role_missing" };
}

export function resolveAdminRole(email: string): AdminRoleResolution {
  return resolveAdminRoleByHash(hashEmail(email));
}

export function isAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return envList("ADMIN_EMAILS").some((item) => item.toLowerCase() === normalized);
}

/**
 * The allowlist itself (WP144 Admins page). The env var is the one source:
 * every admin who can sign in is on it.
 */
export function listAllowlistedAdminEmails(): string[] {
  return envList("ADMIN_EMAILS");
}

/**
 * Resolves an email hash back to its allowlisted email, or null. Used by the
 * MFA reset route so the Admins page can target an admin by hash and no full
 * email address ever travels to the browser.
 */
export function allowlistedEmailByHash(emailHash: string): string | null {
  if (!emailHash) return null;
  for (const email of envList("ADMIN_EMAILS")) {
    if (hashEmail(email) === emailHash) return email;
  }
  return null;
}

/**
 * The Admins page's opaque target key: the hash OF the admin's email hash
 * (WP144 e2e: the page must never render the single-step hash either, since
 * it identifies a person across every console row). A key cannot be turned
 * back into a hash or an email client-side; only this server-side lookup
 * against the allowlist resolves it.
 */
export function adminTargetKey(emailHash: string): string {
  return hashEmail(emailHash);
}

/**
 * Resolves a target key back to its allowlisted admin's email hash, or null
 * when no allowlisted admin matches. The resolution runs on the server only.
 */
export function allowlistedHashByTargetKey(targetKey: string): string | null {
  if (!targetKey) return null;
  for (const email of envList("ADMIN_EMAILS")) {
    const emailHash = hashEmail(email);
    if (hashEmail(emailHash) === targetKey) return emailHash;
  }
  return null;
}

export function createAdminIdentity(email: string) {
  const emailHash = hashEmail(email);
  return {
    id: `admin-${emailHash.slice(0, 24)}`,
    emailHash,
  };
}
