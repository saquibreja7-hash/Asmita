import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { FINDING_STATUSES, findingLabelForQuery, LABEL_QUERY_KEYS, listCrawlFindings } from "@/lib/crawl-findings";

// The label filter values the API accepts (?label=ai-made|sexual|possible-minor).
const LABEL_QUERY_VALUES = Object.values(LABEL_QUERY_KEYS) as [string, ...string[]];

// GET /api/admin/findings?status=CANDIDATE&caseId=...&label=possible-minor:
// crawler findings for review, filterable by review status and by analyst
// label (review labels WP37). The list never carries a URL, a PDQ value or
// another admin's identity; revealing an address is
// /api/admin/findings/[id]?reason=... Reads keep working while
// ENABLE_CRAWLER is off (analysts can see history); crawlerEnabled tells the
// console whether actions are open.

const querySchema = z.object({
  status: z.enum(FINDING_STATUSES).optional(),
  caseId: z.string().min(1).max(64).optional(),
  label: z.enum(LABEL_QUERY_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const { label: rawLabel, ...rest } = parsed.data;
  const label = rawLabel ? findingLabelForQuery(rawLabel) : undefined;
  const findings = await listCrawlFindings({ ...rest, ...(label ? { label } : {}) }, auth.session.sub);
  return NextResponse.json({ findings, crawlerEnabled: crawlerEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
