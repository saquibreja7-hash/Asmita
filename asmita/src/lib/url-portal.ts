import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { writeAuditLog } from "@/lib/audit";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

type DevToken = {
  token: string;
  urlId: string;
  accessCodeHash: string;
  urlEncrypted: string;
  usedAt: string | null;
};

declare global {

  var __asmitaPortalTokenStore: Map<string, DevToken> | undefined;
}

function devTokenStore(): Map<string, DevToken> {
  globalThis.__asmitaPortalTokenStore ??= new Map();
  return globalThis.__asmitaPortalTokenStore;
}

// Generates a human-readable access code without confusable characters (0/O, 1/I).
function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const raw = Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function createPortalToken(
  urlId: string,
  urlEncrypted: string,
): Promise<{ token: string; accessCode: string }> {
  // 256-bit random token - never sequential or guessable. The resolver exposes
  // a live NCII URL; an enumerable token would be a critical privacy failure.
  const token = randomBytes(32).toString("hex");
  const accessCode = generateAccessCode();
  const accessCodeHash = sha256(accessCode);

  if (isDevNoDb()) {
    devTokenStore().set(token, { token, urlId, accessCodeHash, urlEncrypted, usedAt: null });
    return { token, accessCode };
  }

  await db.urlPortalToken.create({ data: { urlId, token, accessCodeHash } });
  return { token, accessCode };
}

export type PortalTokenStatus =
  | { found: false }
  | { found: true; used: boolean };

export async function getPortalTokenStatus(token: string): Promise<PortalTokenStatus> {
  if (isDevNoDb()) {
    const record = devTokenStore().get(token);
    if (!record) return { found: false };
    return { found: true, used: record.usedAt !== null };
  }
  const record = await db.urlPortalToken.findUnique({ where: { token }, select: { usedAt: true } });
  if (!record) return { found: false };
  return { found: true, used: record.usedAt !== null };
}

export type PortalResolveResult =
  | { ok: true; url: string }
  | { ok: false; error: "not_found" | "already_used" | "invalid_code" };

export async function resolvePortalToken(
  token: string,
  accessCode: string,
): Promise<PortalResolveResult> {
  if (isDevNoDb()) {
    const record = devTokenStore().get(token);
    if (!record) return { ok: false, error: "not_found" };
    if (record.usedAt) return { ok: false, error: "already_used" };
    if (sha256(accessCode) !== record.accessCodeHash) return { ok: false, error: "invalid_code" };
    record.usedAt = new Date().toISOString();
    await writeAuditLog({
      eventType: "URL_PORTAL_ACCESSED",
      entityType: "SubmittedUrl",
      entityId: record.urlId,
    });
    return { ok: true, url: decryptField(record.urlEncrypted) };
  }

  // Validate first (no mutation yet).
  const record = await db.urlPortalToken.findUnique({
    where: { token },
    include: { submittedUrl: { select: { id: true, urlEncrypted: true } } },
  });
  if (!record) return { ok: false, error: "not_found" };
  if (record.usedAt) return { ok: false, error: "already_used" };
  if (sha256(accessCode) !== record.accessCodeHash) return { ok: false, error: "invalid_code" };

  // Atomic claim: only one concurrent request wins; loser gets count=0.
  // The URL is never returned unless this update succeeds.
  const claimed = await db.urlPortalToken.updateMany({
    where: { token, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, error: "already_used" };

  await writeAuditLog({
    eventType: "URL_PORTAL_ACCESSED",
    entityType: "SubmittedUrl",
    entityId: record.submittedUrl.id,
  });
  return { ok: true, url: decryptField(record.submittedUrl.urlEncrypted) };
}
