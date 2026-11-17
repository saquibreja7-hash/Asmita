import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { verifyCsrfRequest } from "@/lib/csrf";
import {
  addBlockedCrawlHost,
  blockedHostSchema,
  listBlockedCrawlHosts,
  removeBlockedCrawlHost,
  removeBlockedHostSchema,
} from "@/lib/crawl-blocked-hosts";

// The admin-managed never-crawl list (full-crawler spec WP2): the
// CrawlBlockedHost table on top of the built-in list in crawl-never.ts.
// SUPER_ADMIN only (crawler:manage). Reads work with the crawler off (with
// crawlerEnabled: false); every change is audited (crawl_blocked_host_*)
// and refused with 503 crawler_disabled while ENABLE_CRAWLER is off.

const STATUS: Record<string, number> = {
  invalid_domain: 400,
  private_domain: 400,
  blocked_host_exists: 409,
  blocked_host_not_found: 404,
};

export async function GET() {
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(
    { blockedHosts: await listBlockedCrawlHosts(), crawlerEnabled: crawlerEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = blockedHostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await addBlockedCrawlHost(parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ host: result.host }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = removeBlockedHostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await removeBlockedCrawlHost(parsed.data.id, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ host: result.host });
}
