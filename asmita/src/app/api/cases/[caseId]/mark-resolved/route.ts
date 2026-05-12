import { NextResponse } from "next/server";
import { z } from "zod";
import { cases } from "@/lib/store";
import { writeAuditLog } from "@/lib/audit";
import { verifyCsrfRequest } from "@/lib/csrf";

const schema = z.object({ urlId: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { caseId } = await context.params;
  const record = cases.get(caseId);
  const url = record?.urls.find((item) => item.id === parsed.data.urlId);
  if (!url) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  url.status = "REMOVED";
  await writeAuditLog({ eventType: "CONTENT_REMOVED", entityType: "SubmittedUrl", entityId: url.id });
  return NextResponse.json({ success: true });
}
