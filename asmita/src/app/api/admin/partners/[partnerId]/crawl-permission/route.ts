import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { crawlPermissionSchema, recordPartnerCrawlPermission } from "@/lib/partner-admin";

// POST /api/admin/partners/[partnerId]/crawl-permission { date, note } —
// record the platform's written permission for Asmita's crawler to monitor
// its public pages. Crawler monitoring (WP33) is allowed only once this is
// recorded. platforms:edit, CSRF, audited.

const ACTIONS_PER_HOUR = 100;

const STATUS: Record<string, number> = {
  partner_not_found: 404,
  invalid_date: 400,
  future_date: 400,
};

export async function POST(request: Request, context: { params: Promise<{ partnerId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("platforms:edit");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-partners:${auth.session.sub}`, ACTIONS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = crawlPermissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { partnerId } = await context.params;
  const result = await recordPartnerCrawlPermission({ partnerId, ...parsed.data }, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ partner: result.partner, ...(result.crawlSources ? { crawlSources: result.crawlSources } : {}) });
}
