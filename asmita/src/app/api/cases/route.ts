import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { cases } from "@/lib/store";

export async function GET() {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({
    cases: Array.from(cases.values()).filter((record) => record.userId === auth.session.sub),
  });
}
