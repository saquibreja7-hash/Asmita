import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/encryption";
import { hashEmail } from "@/lib/hash";
import type { AdminRole } from "@/lib/auth/admin-permissions";

/*
 * Admins added from the console (owner decision 2026-11-26, superseding the
 * WP144 "environment is the only source" note).
 *
 * Two sources, one rule each:
 * - ADMIN_EMAILS / ADMIN_ROLES (the environment) are the owners. They always
 *   win, can never be changed or removed from the console, and are how the
 *   very first admin exists.
 * - ConsoleAdmin rows are everyone a SUPER_ADMIN added later. Their role can
 *   be changed and they can be removed, from /admin/admins only, and every
 *   change is audited.
 *
 * The address is stored encrypted; lookups go by email hash, as everywhere
 * else in the console. Local development without a database keeps rows in
 * memory.
 */

export type ConsoleAdminRow = { emailHash: string; email: string; role: string; addedBy: string; createdAt: Date };

const memory = new Map<string, ConsoleAdminRow>();

function databaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export async function listConsoleAdmins(): Promise<ConsoleAdminRow[]> {
  if (!databaseEnabled()) return [...memory.values()];
  const rows = await db.consoleAdmin.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    emailHash: row.emailHash,
    email: decryptField(row.emailEncrypted),
    role: row.role,
    addedBy: row.addedBy,
    createdAt: row.createdAt,
  }));
}

export async function getConsoleAdmin(emailHash: string): Promise<ConsoleAdminRow | null> {
  if (!emailHash) return null;
  if (!databaseEnabled()) return memory.get(emailHash) ?? null;
  const row = await db.consoleAdmin.findUnique({ where: { emailHash } });
  if (!row) return null;
  return { emailHash: row.emailHash, email: decryptField(row.emailEncrypted), role: row.role, addedBy: row.addedBy, createdAt: row.createdAt };
}

export async function addConsoleAdmin(email: string, role: AdminRole, addedBy: string): Promise<ConsoleAdminRow> {
  const normalized = email.trim().toLowerCase();
  const emailHash = hashEmail(normalized);
  const row = { emailHash, email: normalized, role, addedBy, createdAt: new Date() };
  if (!databaseEnabled()) {
    memory.set(emailHash, row);
    return row;
  }
  await db.consoleAdmin.create({
    data: { emailHash, emailEncrypted: encryptField(normalized), role, addedBy },
  });
  return row;
}

export async function setConsoleAdminRole(emailHash: string, role: AdminRole): Promise<boolean> {
  if (!databaseEnabled()) {
    const row = memory.get(emailHash);
    if (!row) return false;
    memory.set(emailHash, { ...row, role });
    return true;
  }
  const result = await db.consoleAdmin.updateMany({ where: { emailHash }, data: { role } });
  return result.count > 0;
}

export async function removeConsoleAdmin(emailHash: string): Promise<boolean> {
  if (!databaseEnabled()) return memory.delete(emailHash);
  const result = await db.consoleAdmin.deleteMany({ where: { emailHash } });
  return result.count > 0;
}

/** Test helper: clears the in-memory store. */
export function resetConsoleAdminsForTests() {
  memory.clear();
}
