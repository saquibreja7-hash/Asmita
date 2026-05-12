import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { recordFeedback } from "@/lib/feedback";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({
  caseReference: z.string().max(64).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/feedback" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const record = recordFeedback({
    ...parsed.data,
    rating: parsed.data.rating as 1 | 2 | 3 | 4 | 5,
  });
  return NextResponse.json({ id: record.id });
}
