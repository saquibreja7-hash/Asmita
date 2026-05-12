import IORedis from "ioredis";

const buckets = new Map<string, { count: number; resetAt: number }>();
let redis: IORedis | null = null;

function shouldUseRedis() {
  return process.env.RATE_LIMIT_DRIVER === "redis" && Boolean(process.env.REDIS_URL);
}

function getRedis() {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  }
  return redis;
}

export async function checkRedisRateLimit(key: string, limit: number, windowMs: number) {
  const client = getRedis();
  const redisKey = `rate:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    await client.pexpire(redisKey, windowMs);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export function checkMemoryRateLimit(key: string, limit: number, windowMs: number) {
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

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  if (shouldUseRedis()) {
    throw new Error("Use checkRateLimitAsync when RATE_LIMIT_DRIVER=redis.");
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}

export async function checkRateLimitAsync(key: string, limit: number, windowMs: number) {
  if (shouldUseRedis()) {
    return checkRedisRateLimit(key, limit, windowMs);
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}
