import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import {
  exportDecisionLogCsv,
  parseDecisionLogFilters,
} from "@/lib/review-decisions-log";

// WP145 (review-console-spec.md): the decisions log's CSV export. GET, like
// the survivor's own case export: it changes nothing, it only reads — and
// like every export it writes an audit event first. The columns are fixed
// (decided at IST, queue, kind, decision, reason label, reviewer handle,
// case reference, claim-to-decision seconds): no URLs, no notes, no PII —
// the reason note is never selected by the library below.
export async function GET(request: Request) {
  const auth = await requireAdminPermission("audit:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = parseDecisionLogFilters(params);

  const exported = await exportDecisionLogCsv({ emailHash: auth.session.emailHash, role: auth.session.adminRole }, filters);
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "ReviewDecision",
    entityId: "export",
    actorId: auth.session.sub,
    // Ids and counts only: the filters as they were applied, never a note.
    data: {
      action: "decisions_csv_export",
      count: exported.count,
      capped: exported.capped,
      filters: {
        queue: filters.queueKey ?? null,
        kind: filters.subjectKind ?? null,
        decision: filters.decision ?? null,
        reviewer: filters.reviewerEmailHash ?? null,
        reason: filters.reasonCode ?? null,
        from: filters.fromIstDay ?? null,
        to: filters.toIstDay ?? null,
        case: filters.caseReference ?? null,
      },
    },
  });

  return new Response(exported.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="review-decisions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
