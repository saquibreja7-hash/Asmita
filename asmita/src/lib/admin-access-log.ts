import { db } from "@/lib/db";
import { hashIp } from "@/lib/hash";

/** Why an admin revealed a survivor's link; one is required. */
export const REVEAL_REASONS = ["check_removal", "survivor_asked", "platform_asked", "other"] as const;
export type RevealReason = (typeof REVEAL_REASONS)[number];

export type AdminAccessEvent = {
  adminId: string;
  action: "case_viewed" | "url_revealed";
  entityType: "Case" | "SubmittedUrl";
  entityId: string;
  reason?: string;
};

// Kept for local development without a database, and for tests.
export const inMemoryAdminAccessLog: Array<AdminAccessEvent & { createdAt: string }> = [];

function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    null
  );
}

/**
 * Records which admin opened a case or revealed a link. Never the URL.
 * A failure is logged and swallowed for views, but a reveal must not happen
 * unrecorded, so callers pass `required: true` and get the error.
 */
export async function recordAdminAccess(
  event: AdminAccessEvent,
  headers?: Headers,
  options: { required?: boolean } = {},
) {
  try {
    if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
      inMemoryAdminAccessLog.push({ ...event, createdAt: new Date().toISOString() });
      return;
    }
    const ip = headers ? clientIp(headers) : null;
    await db.adminAccessLog.create({
      data: {
        adminId: event.adminId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        reason: event.reason ?? null,
        ipHash: ip ? hashIp(ip) : null,
        userAgent: headers?.get("user-agent")?.slice(0, 300) ?? null,
      },
    });
  } catch (err) {
    console.error(`Admin access log failed for ${event.action}`, err);
    if (options.required) throw err;
  }
}
