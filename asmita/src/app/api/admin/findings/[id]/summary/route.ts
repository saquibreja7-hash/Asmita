import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { getCrawlFindingSummary } from "@/lib/crawl-findings";

// GET /api/admin/findings/[id]/summary: one finding as the list shows it,
// with no address, no PDQ value and no other admin's identity. Not a reveal,
// so no reason, access log or reveal rate limit; the addresses stay behind
// /api/admin/findings/[id]?reason=... Works while ENABLE_CRAWLER is off.

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  if (!id || id.length > 64) return NextResponse.json({ error: "finding_not_found" }, { status: 404 });
  const finding = await getCrawlFindingSummary(id, auth.session.sub);
  const headers = { "Cache-Control": "no-store" };
  if (!finding) return NextResponse.json({ error: "finding_not_found" }, { status: 404, headers });
  return NextResponse.json({ finding, crawlerEnabled: crawlerEnabled() }, { headers });
}
