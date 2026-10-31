import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { randomUUID } from "node:crypto";

export type SecurityEvent = {
  event:
    | "csrf_failed"
    | "rate_limit_exceeded"
    | "auth_failed"
    | "admin_denied"
    | "email_failed"
    | "otp_persistence_failed"
    | "rate_limit_unavailable"
    | "minor_route_blocked"
    | "flagged_submission"
    | "media_payload_rejected";
  actorHash?: string;
  route?: string;
  reason?: string;
  createdAt?: string;
};

export const securityEvents: SecurityEvent[] = [];

export async function logSecurityEvent(event: SecurityEvent) {
  const entry = { ...event, createdAt: new Date().toISOString() };
  securityEvents.push(entry);
  console.warn(JSON.stringify(entry));

  if (process.env.SECURITY_LOG_PERSISTENCE === "database") {
    if (usesWorkerKysely()) {
      try {
        await getWorkerDb().insertInto("SecurityEventLog").values({
          id: randomUUID(), event: entry.event, actorHash: entry.actorHash ?? null, route: entry.route ?? null, reason: entry.reason ?? null,
        }).execute();
      } catch (err) {
        console.error("[security-log] DB write failed:", err);
      }
      return;
    }
    // Awaited, never fire-and-forget: a request that ends before the write
    // finishes can lose it (on Workers the isolate may stop), and these
    // events include minor_route_blocked.
    try {
      const { db } = await import("@/lib/db");
      await db.securityEventLog.create({
        data: {
          event: entry.event,
          actorHash: entry.actorHash ?? null,
          route: entry.route ?? null,
          reason: entry.reason ?? null,
        },
      });
    } catch (err) {
      console.error("[security-log] DB write failed:", err);
    }
  }
}
