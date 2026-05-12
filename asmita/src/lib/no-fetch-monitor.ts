import type { inMemoryAuditLog } from "@/lib/audit";

type AuditEntry = (typeof inMemoryAuditLog)[number];

export function summarizeNoFetchInvariant(events: AuditEntry[]) {
  const violations = events.filter(
    (event) => event.eventType === "ADMIN_ACTION" && event.data?.type === "NO_FETCH_INVARIANT_VIOLATION",
  );
  return {
    violations: violations.length,
    healthy: violations.length === 0,
  };
}
