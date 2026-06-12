import { hashEmail } from "@/lib/hash";
import type { AdminRole } from "@/lib/auth/admin-permissions";

const ADMIN_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "LEGAL_ADVISOR",
  "CASE_REVIEWER",
  "GO_EDITOR",
  "SUPPORT_AGENT",
]);

/**
 * Sub-role per admin email, configured as
 * ADMIN_ROLES="legal@example.org=LEGAL_ADVISOR,reviewer@example.org=CASE_REVIEWER".
 * Emails in ADMIN_EMAILS without an entry default to SUPER_ADMIN (the founder
 * bootstrap case); unknown role names are ignored rather than granted.
 */
export function getAdminRole(email: string): AdminRole {
  const normalized = email.trim().toLowerCase();
  const entries = (process.env.ADMIN_ROLES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [entryEmail, role] = entry.split("=").map((part) => part?.trim());
    if (entryEmail?.toLowerCase() === normalized && role && ADMIN_ROLES.has(role)) {
      return role as AdminRole;
    }
  }
  return "SUPER_ADMIN";
}

export function isAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(normalized);
}

export function createAdminIdentity(email: string) {
  const emailHash = hashEmail(email);
  return {
    id: `admin-${emailHash.slice(0, 24)}`,
    emailHash,
  };
}
