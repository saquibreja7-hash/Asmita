import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sha256 } from "@/lib/hash";
import { safeEqual } from "@/lib/safe-equal";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";
import { partnerMemory } from "@/lib/partner-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Authentication for the partner API routes (/api/partner/v1/*, WP32).
 * Partner programme, part 2 (WP30): keys are issued by an admin in the
 * console to one partner (src/lib/partner-admin.ts), shown once, and only
 * their sha256 is stored — the same shape as the crawler service key
 * (src/lib/crawler-auth.ts, scripts/issue-crawler-service-key.mjs).
 *
 * A missing, wrong or revoked key gets the same 401, so the response never
 * says which; a suspended partner's key gets 403 partner_suspended, because
 * the partner knows it is suspended and the console shows the same state.
 * There is no ENABLE_* switch here: a partner is gated by the admin's
 * approval (the row) and the key, not by a deployment flag.
 *
 * Routes must still validate input with strict Zod schemas, cap the body
 * size and log counts only (partner-sharing spec, Rule 6).
 */

const KEY_PREFIX = "ppk_";
// Generous, so a misbehaving client is stopped long before it can guess a
// 192-bit key, and a healthy partner poller is never limited.
const IP_ATTEMPTS_PER_10_MIN = 300;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Only the sha256 of the key is ever stored or compared. */
export function hashPartnerKey(key: string) {
  return sha256(key);
}

export function generatePartnerKey() {
  return `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

/** Issues a key for one partner and stores only its hash. Returns the key once. */
export async function issuePartnerKey(partnerId: string, label: string): Promise<{ id: string; key: string }> {
  const key = generatePartnerKey();
  const keyHash = hashPartnerKey(key);
  if (isDevNoDb()) {
    const id = randomUUID();
    partnerMemory().keys.set(id, { id, partnerId, keyHash, label, createdAt: new Date(), revokedAt: null, lastUsedAt: null });
    return { id, key };
  }
  if (usesWorkerKysely()) {
    const id = randomUUID();
    await getWorkerDb().insertInto("PlatformPartnerKey").values({ id, partnerId, keyHash, label }).execute();
    return { id, key };
  }
  const { db } = await import("@/lib/db");
  const row = await db.platformPartnerKey.create({ data: { partnerId, keyHash, label }, select: { id: true } });
  return { id: row.id, key };
}

/** Revokes a key by id; false when it is missing or already revoked. */
export async function revokePartnerKey(id: string): Promise<boolean> {
  if (isDevNoDb()) {
    const record = partnerMemory().keys.get(id);
    if (!record || record.revokedAt) return false;
    record.revokedAt = new Date();
    return true;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("PlatformPartnerKey").set({ revokedAt: new Date() })
      .where("id", "=", id).where("revokedAt", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
  const { db } = await import("@/lib/db");
  const { count } = await db.platformPartnerKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return count > 0;
}

type KeyRow = { id: string; partnerId: string; keyHash: string; revokedAt: Date | null };

async function findKey(keyHash: string): Promise<KeyRow | null> {
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("PlatformPartnerKey").select(["id", "partnerId", "keyHash", "revokedAt"])
      .where("keyHash", "=", keyHash).executeTakeFirst();
    return row ? { ...row, revokedAt: row.revokedAt ? new Date(row.revokedAt) : null } : null;
  }
  const { db } = await import("@/lib/db");
  return db.platformPartnerKey.findUnique({ where: { keyHash }, select: { id: true, partnerId: true, keyHash: true, revokedAt: true } });
}

/** The partner's status: only ACTIVE partners may use the partner routes. */
async function partnerStatus(partnerId: string): Promise<"ACTIVE" | "SUSPENDED" | null> {
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("PlatformPartner").select("status").where("id", "=", partnerId).executeTakeFirst();
    return (row?.status as "ACTIVE" | "SUSPENDED" | undefined) ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.platformPartner.findUnique({ where: { id: partnerId }, select: { status: true } });
  return row?.status ?? null;
}

async function touchKey(id: string) {
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("PlatformPartnerKey").set({ lastUsedAt: new Date() }).where("id", "=", id).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.platformPartnerKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
}

export type PartnerKeyVerification =
  | { ok: true; keyId: string; partnerId: string }
  | { ok: false; reason: "invalid" | "revoked" | "partner_missing" | "suspended" };

/**
 * Checks one bearer key. The lookup is by a hash of the secret, so its
 * timing reveals nothing about the secret; the comparison is constant time
 * anyway. `suspended` is reported separately (the caller answers 403), so a
 * suspended platform can be told why without anything being said about the
 * key. lastUsedAt is touched only on success.
 */
export async function verifyPartnerKey(key: string): Promise<PartnerKeyVerification> {
  const keyHash = hashPartnerKey(key);
  if (isDevNoDb()) {
    let match: MemoryKeyMatch | null = null;
    // Compare against every key so the time taken does not depend on which matched.
    for (const record of partnerMemory().keys.values()) {
      if (safeEqual(record.keyHash, keyHash)) match = { keyId: record.id, partnerId: record.partnerId, revoked: record.revokedAt !== null };
    }
    if (!match) return { ok: false, reason: "invalid" };
    if (match.revoked) return { ok: false, reason: "revoked" };
    const partner = partnerMemory().partners.get(match.partnerId);
    if (!partner) return { ok: false, reason: "partner_missing" };
    if (partner.status !== "ACTIVE") return { ok: false, reason: "suspended" };
    partnerMemory().keys.get(match.keyId)!.lastUsedAt = new Date();
    return { ok: true, keyId: match.keyId, partnerId: match.partnerId };
  }
  // The lookup is by a hash of the secret, so its timing reveals nothing
  // about the secret; the comparison below is constant time anyway.
  const record = await findKey(keyHash);
  if (!record || !safeEqual(record.keyHash, keyHash)) return { ok: false, reason: "invalid" };
  if (record.revokedAt) return { ok: false, reason: "revoked" };
  const status = await partnerStatus(record.partnerId);
  if (!status) return { ok: false, reason: "partner_missing" };
  if (status !== "ACTIVE") return { ok: false, reason: "suspended" };
  await touchKey(record.id).catch(() => undefined);
  return { ok: true, keyId: record.id, partnerId: record.partnerId };
}

type MemoryKeyMatch = { keyId: string; partnerId: string; revoked: boolean };

const BEARER = /^Bearer ([A-Za-z0-9_-]{16,200})$/;

export type PartnerAuth = { ok: true; keyId: string; partnerId: string } | { ok: false; response: NextResponse };

const noStore = { "Cache-Control": "no-store" };

export function partnerJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export type PartnerBodyResult<T> = { ok: true; value: T } | { ok: false; error: "payload_too_large" | "invalid_payload" };

/**
 * Reads one partner request body: capped in bytes, then validated against a
 * strict schema (Rule 6). Callers answer 413 for payload_too_large and 400
 * for invalid_payload and never log the body itself.
 */
export async function readPartnerBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 32 * 1024,
): Promise<PartnerBodyResult<z.output<S>>> {
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > maxBytes) return { ok: false, error: "payload_too_large" };
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  return { ok: true, value: parsed.data as z.output<S> };
}

/**
 * Rate limits and key check shared by every partner route. `route` names the
 * per-key limit bucket; `perHour` is that route's budget. The returned
 * partnerId scopes every query the route makes, so a partner only ever sees
 * its own data (Rule 6).
 */
export async function authenticatePartner(request: Request, route: string, perHour: number): Promise<PartnerAuth> {
  // Before any database lookup, so guessing keys is throttled.
  const ipLimit = await checkRateLimitAsync(`partner-ip:${getClientIp(request)}`, IP_ATTEMPTS_PER_10_MIN, 10 * 60_000);
  if (!ipLimit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: `/api/partner/${route}` });
    return { ok: false, response: partnerJson({ error: "rate_limited" }, 429) };
  }
  const match = BEARER.exec(request.headers.get("authorization") ?? "");
  const verification = match ? await verifyPartnerKey(match[1]) : null;
  if (!verification) {
    await logSecurityEvent({ event: "auth_failed", route: `/api/partner/${route}` });
    return { ok: false, response: partnerJson({ error: "unauthorized" }, 401) };
  }
  if (!verification.ok) {
    // A valid key of a suspended partner: the key is fine, the partner is
    // not. Answered 403 with the reason; nothing is said about any key.
    if (verification.reason === "suspended") {
      return { ok: false, response: partnerJson({ error: "partner_suspended" }, 403) };
    }
    await logSecurityEvent({ event: "auth_failed", route: `/api/partner/${route}` });
    return { ok: false, response: partnerJson({ error: "unauthorized" }, 401) };
  }
  const keyLimit = await checkRateLimitAsync(`partner-key:${verification.keyId}:${route}`, perHour, 60 * 60_000);
  if (!keyLimit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: `/api/partner/${route}` });
    return { ok: false, response: partnerJson({ error: "rate_limited" }, 429) };
  }
  return { ok: true, keyId: verification.keyId, partnerId: verification.partnerId };
}
