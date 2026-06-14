import { db } from "@/lib/db";

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

export function logSecurityEvent(event: SecurityEvent) {
  const entry = { ...event, createdAt: new Date().toISOString() };
  securityEvents.push(entry);
  console.warn(JSON.stringify(entry));

  if (process.env.SECURITY_LOG_PERSISTENCE === "database") {
    db.securityEventLog
      .create({
        data: {
          event: entry.event,
          actorHash: entry.actorHash ?? null,
          route: entry.route ?? null,
          reason: entry.reason ?? null,
        },
      })
      .catch((err: unknown) => {
        console.error("[security-log] DB write failed:", err);
      });
  }
}
