import { hashEmail } from "@/lib/hash";

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
