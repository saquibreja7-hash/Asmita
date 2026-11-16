import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { readAuditTrail } from "@/lib/audit";

/*
 * What the survivor sees of their own case history. Nothing here is shown in
 * the app today; the route returns only the what and when. Stored `data`
 * (reviewer and admin reasons, partner names, fingerprint ids, internal
 * flags), the actor id of anyone but the survivor, the IP hash and the hash
 * chain stay server-side. `byYou` says whether the survivor did it.
 */
function toSurvivorEvent(
  event: Awaited<ReturnType<typeof readAuditTrail>>[number],
  survivorId: string,
) {
  return {
    sequence: event.sequence,
    eventType: event.eventType,
    createdAt: event.createdAt,
    byYou: event.actorId === survivorId,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { caseId } = await context.params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const events = await readAuditTrail(caseId);
  return NextResponse.json({ events: events.map((event) => toSurvivorEvent(event, auth.session.sub)) });
}
