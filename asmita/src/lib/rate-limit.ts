import { sha256 } from "@/lib/hash";
import { queryPostgres } from "@/lib/worker-postgres";

/*
 * Fixed-window rate limits. With a database configured, counters live in
 * Postgres (RateLimitBucket), so every Worker isolate shares them; a limit
 * that only counted per isolate could be bypassed by spreading requests.
 * Without a database (local dev), counters live in memory.
 *
 * If the database write fails, the in-memory counter still applies, so a
 * database hiccup degrades protection instead of locking survivors out.
 */

type RateLimitResult = { allowed: boolean; remaining: number };
type RateLimitOptions = {
  // Buckets many users share by design: a client IP or an email domain. All
  // E2E test users share 127.0.0.1 and a few synthetic domains, so only these
  // are lifted by the test bypass; per-account limits and the site-wide OTP
  // budget stay enforced.
  shared?: boolean;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkMemoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  current.count += 1;
  return { allowed: true, remaining: limit - current.count };
}

function testBypassEnabled(options: RateLimitOptions) {
  return (
    options.shared === true &&
    process.env.E2E_TEST_BYPASS_RATE_LIMIT === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

async function checkDatabaseRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const result = await queryPostgres<{ count: number }>(
    `INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES ($1, now(), 1)
     ON CONFLICT ("key") DO UPDATE SET
       "count" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - make_interval(secs => $2)
                      THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
       "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - make_interval(secs => $2)
                            THEN now() ELSE "RateLimitBucket"."windowStart" END
     RETURNING "count"`,
    [sha256(key), windowMs / 1000],
  );
  const count = result.rows[0].count;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  if (testBypassEnabled(options)) {
    return { allowed: true, remaining: limit };
  }
  if (process.env.DATABASE_URL) {
    try {
      return await checkDatabaseRateLimit(key, limit, windowMs);
    } catch (err) {
      console.error("[rate-limit] database counter failed; using in-memory fallback", err);
    }
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}

// Removes counters whose window ended long ago. Run from the maintenance cron.
export async function pruneRateLimitBuckets() {
  if (!process.env.DATABASE_URL) return 0;
  const result = await queryPostgres(`DELETE FROM "RateLimitBucket" WHERE "windowStart" < now() - interval '2 days'`);
  return result.rowCount ?? 0;
}
