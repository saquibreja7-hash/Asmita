export type SecurityEvent = {
  event:
    | "csrf_failed"
    | "rate_limit_exceeded"
    | "auth_failed"
    | "admin_denied"
    | "minor_route_blocked"
    | "flagged_submission";
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
}
