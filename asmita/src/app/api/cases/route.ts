import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { listCasesForUser } from "@/lib/case-ops";

export async function GET() {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const cases = await listCasesForUser(auth.session.sub);
  return NextResponse.json({ cases });
}
