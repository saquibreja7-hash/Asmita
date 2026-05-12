import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { cases } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { caseId } = await context.params;
  const record = cases.get(caseId);
  if (!record || record.userId !== auth.session.sub) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(record);
}
