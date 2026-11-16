import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { FINDING_STATUSES, listCrawlFindings } from "@/lib/crawl-findings";

// GET /api/admin/findings?status=CANDIDATE&caseId=...: crawler findings for
// review. The list never carries a URL; revealing one is /api/admin/findings/[id].

const querySchema = z.object({
  status: z.enum(FINDING_STATUSES).optional(),
  caseId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const findings = await listCrawlFindings(parsed.data);
  return NextResponse.json({ findings }, { headers: { "Cache-Control": "no-store" } });
}
