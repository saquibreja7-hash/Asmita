import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/encryption";

/*
 * Per-admin TOTP secrets, encrypted at rest and keyed by the admin's email hash.
 *
 * Login order of preference:
 *   1. the admin's own enrolled secret;
 *   2. only while an admin has NOT enrolled, the shared ADMIN_TOTP_SECRET env
 *      value as a bootstrap so a first login can reach /admin/setup-mfa.
 * Once enrolled, the shared secret no longer works for that admin. A SUPER_ADMIN
 * can reset an enrolment, which returns that admin to the bootstrap state.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateBase32Secret(bytes = 20) {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function databaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

const memoryStore = new Map<string, { secret: string; enrolledAt: Date }>();

export async function getAdminMfaSecret(emailHash: string): Promise<string | null> {
  if (!databaseEnabled()) return memoryStore.get(emailHash)?.secret ?? null;
  const row = await db.adminMfaSecret.findUnique({ where: { emailHash } });
  return row ? decryptField(row.secretEncrypted) : null;
}

export async function getAdminMfaEnrolment(emailHash: string): Promise<{ enrolledAt: Date } | null> {
  if (!databaseEnabled()) {
    const row = memoryStore.get(emailHash);
    return row ? { enrolledAt: row.enrolledAt } : null;
  }
  const row = await db.adminMfaSecret.findUnique({
    where: { emailHash },
    select: { enrolledAt: true },
  });
  return row;
}

/** Creates a fresh secret for an admin who has none. Returns null if already enrolled. */
export async function enrolAdminMfa(emailHash: string): Promise<string | null> {
  const secret = generateBase32Secret();
  if (!databaseEnabled()) {
    if (memoryStore.has(emailHash)) return null;
    memoryStore.set(emailHash, { secret, enrolledAt: new Date() });
    return secret;
  }
  try {
    await db.adminMfaSecret.create({
      data: { emailHash, secretEncrypted: encryptField(secret) },
    });
    return secret;
  } catch {
    // Unique violation: a concurrent or earlier enrolment won.
    return null;
  }
}

export async function resetAdminMfa(emailHash: string): Promise<boolean> {
  if (!databaseEnabled()) return memoryStore.delete(emailHash);
  const result = await db.adminMfaSecret.deleteMany({ where: { emailHash } });
  return result.count > 0;
}

export async function touchAdminMfa(emailHash: string) {
  if (!databaseEnabled()) return;
  await db.adminMfaSecret.updateMany({ where: { emailHash }, data: { lastUsedAt: new Date() } });
}
