const buckets = new Map<string, { count: number; resetAt: number }>();

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

function testBypassEnabled() {
  return (
    process.env.E2E_TEST_BYPASS_RATE_LIMIT === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  if (testBypassEnabled()) {
    return { allowed: true, remaining: limit };
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}

export async function checkRateLimitAsync(key: string, limit: number, windowMs: number) {
  return checkRateLimit(key, limit, windowMs);
}
