import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sha256 } from "@/lib/hash";
import { safeEqual } from "@/lib/safe-equal";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";
import { crawlMemory } from "@/lib/crawl-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Authentication for the crawler service routes (/api/crawler/*).
 *
 * ENABLE_CRAWLER is a deployment switch (like ENABLE_HASH_UPLOAD), not a dev
 * bypass: it opens nothing that is safe only in development, so it is read
 * here and not through dev-flags.ts. Off by default; while off every crawler
 * route answers 503 before looking at the key.
 *
 * Keys are random bearer secrets issued by scripts/issue-crawler-service-key.mjs.
 * Only sha256(key) is stored. A missing, wrong or revoked key gets the same
 * 401, so the response never says which.
 */

export function crawlerEnabled() {
  return process.env.ENABLE_CRAWLER === "true";
}

const KEY_PREFIX = "cwk_";
// Generous, so a misbehaving client is stopped long before it can guess a
// 192-bit key, and a real crawler is never limited.
const IP_ATTEMPTS_PER_10_MIN = 300;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Must match the hash in scripts/issue-crawler-service-key.mjs (tests check). */
export function hashCrawlerKey(key: string) {
  return sha256(key);
}

export function generateCrawlerKey() {
  return `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

/** Issues a key and stores only its hash. Returns the key once. */
export async function issueCrawlServiceKey(name: string): Promise<{ id: string; key: string }> {
  const key = generateCrawlerKey();
  const keyHash = hashCrawlerKey(key);
  if (isDevNoDb()) {
    const id = randomUUID();
    crawlMemory().keys.set(id, { id, name, keyHash, createdAt: new Date(), revokedAt: null, lastUsedAt: null });
    return { id, key };
  }
  if (usesWorkerKysely()) {
    const id = randomUUID();
    await getWorkerDb().insertInto("CrawlServiceKey").values({ id, name, keyHash }).execute();
    return { id, key };
  }
  const { db } = await import("@/lib/db");
  const row = await db.crawlServiceKey.create({ data: { name, keyHash }, select: { id: true } });
  return { id: row.id, key };
}

export async function revokeCrawlServiceKey(id: string): Promise<boolean> {
  if (isDevNoDb()) {
    const record = crawlMemory().keys.get(id);
    if (!record || record.revokedAt) return false;
    record.revokedAt = new Date();
    return true;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("CrawlServiceKey").set({ revokedAt: new Date() })
      .where("id", "=", id).where("revokedAt", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
  const { db } = await import("@/lib/db");
  const { count } = await db.crawlServiceKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return count > 0;
}

type KeyRow = { id: string; keyHash: string; revokedAt: Date | null };

async function findKey(keyHash: string): Promise<KeyRow | null> {
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CrawlServiceKey").select(["id", "keyHash", "revokedAt"])
      .where("keyHash", "=", keyHash).executeTakeFirst();
    return row ? { ...row, revokedAt: row.revokedAt ? new Date(row.revokedAt) : null } : null;
  }
  const { db } = await import("@/lib/db");
  return db.crawlServiceKey.findUnique({ where: { keyHash }, select: { id: true, keyHash: true, revokedAt: true } });
}

async function touchKey(id: string) {
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("CrawlServiceKey").set({ lastUsedAt: new Date() }).where("id", "=", id).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.crawlServiceKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
}

/** The key's id when it is valid and not revoked, else null. */
export async function verifyCrawlerKey(key: string): Promise<string | null> {
  const keyHash = hashCrawlerKey(key);
  if (isDevNoDb()) {
    let match: string | null = null;
    // Compare against every key so the time taken does not depend on which matched.
    for (const record of crawlMemory().keys.values()) {
      if (safeEqual(record.keyHash, keyHash) && !record.revokedAt) match = record.id;
    }
    if (match) crawlMemory().keys.get(match)!.lastUsedAt = new Date();
    return match;
  }
  // The lookup is by a hash of the secret, so its timing reveals nothing
  // about the secret; the comparison below is constant time anyway.
  const record = await findKey(keyHash);
  if (!record || !safeEqual(record.keyHash, keyHash) || record.revokedAt) return null;
  await touchKey(record.id).catch(() => undefined);
  return record.id;
}

const BEARER = /^Bearer ([A-Za-z0-9_-]{16,200})$/;

export type CrawlerAuth = { ok: true; keyId: string } | { ok: false; response: NextResponse };

const noStore = { "Cache-Control": "no-store" };

export function crawlerJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

/**
 * Switch, rate limits and key check shared by every crawler route. `route`
 * names the per-key limit bucket; `perHour` is that route's budget.
 */
export async function authenticateCrawler(request: Request, route: string, perHour: number): Promise<CrawlerAuth> {
  if (!crawlerEnabled()) {
    return { ok: false, response: crawlerJson({ error: "crawler_disabled" }, 503) };
  }
  // Before any database lookup, so guessing keys is throttled.
  const ipLimit = await checkRateLimitAsync(`crawler-ip:${getClientIp(request)}`, IP_ATTEMPTS_PER_10_MIN, 10 * 60_000);
  if (!ipLimit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: `/api/crawler/${route}` });
    return { ok: false, response: crawlerJson({ error: "rate_limited" }, 429) };
  }
  const match = BEARER.exec(request.headers.get("authorization") ?? "");
  const keyId = match ? await verifyCrawlerKey(match[1]) : null;
  if (!keyId) {
    await logSecurityEvent({ event: "auth_failed", route: `/api/crawler/${route}` });
    return { ok: false, response: crawlerJson({ error: "unauthorized" }, 401) };
  }
  const keyLimit = await checkRateLimitAsync(`crawler-key:${keyId}:${route}`, perHour, 60 * 60_000);
  if (!keyLimit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: `/api/crawler/${route}` });
    return { ok: false, response: crawlerJson({ error: "rate_limited" }, 429) };
  }
  return { ok: true, keyId };
}
