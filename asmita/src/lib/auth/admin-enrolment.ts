import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/hash";

/*
 * One-time admin enrolment codes (ADR 004, M11). They replace the shared
 * ADMIN_TOTP_SECRET bootstrap, which let anyone holding the shared secret and
 * an allowlisted inbox enrol their own authenticator.
 *
 * A code is issued for one admin email by a SUPER_ADMIN (POST
 * /api/admin/mfa/reset) or, for the very first admin, by
 * scripts/issue-admin-enrolment-code.mjs, and is handed over out of band.
 * It is stored as a sha256 hash, expires after 24 hours, and is consumed by
 * the login that uses it, together with the email code.
 */

export const ENROLMENT_CODE_TTL_MS = 24 * 60 * 60_000;
const CODE_PATTERN = /^\d{12}$/;

const memoryCodes = new Map<string, { codeHash: string; expiresAt: Date }>();

function databaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export function generateEnrolmentCode() {
  let code = "";
  for (let i = 0; i < 12; i += 1) code += String(randomInt(10));
  return code;
}

// Replaces any earlier code for this admin.
export async function issueAdminEnrolmentCode(emailHash: string, createdBy: string) {
  const code = generateEnrolmentCode();
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + ENROLMENT_CODE_TTL_MS);
  if (!databaseEnabled()) {
    memoryCodes.set(emailHash, { codeHash, expiresAt });
  } else {
    await db.adminEnrolmentCode.upsert({
      where: { emailHash },
      create: { emailHash, codeHash, expiresAt, createdBy },
      update: { codeHash, expiresAt, createdBy, createdAt: new Date() },
    });
  }
  return { code, expiresAt };
}

// True once, for a matching unexpired code; the code is gone afterwards.
export async function consumeAdminEnrolmentCode(emailHash: string, code: string) {
  if (!CODE_PATTERN.test(code)) return false;
  const codeHash = sha256(code);
  if (!databaseEnabled()) {
    const row = memoryCodes.get(emailHash);
    if (!row || row.codeHash !== codeHash || row.expiresAt <= new Date()) return false;
    memoryCodes.delete(emailHash);
    return true;
  }
  // A single conditional delete, so two concurrent logins cannot both use it.
  const deleted = await db.adminEnrolmentCode.deleteMany({
    where: { emailHash, codeHash, expiresAt: { gt: new Date() } },
  });
  return deleted.count === 1;
}
