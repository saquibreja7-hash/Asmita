import { NextResponse } from "next/server";
import { readAuditTrail } from "@/lib/audit";

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  return NextResponse.json({ events: readAuditTrail(caseId) });
}
