import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { verifyCsrfRequest } from "@/lib/csrf";
import { importCrawlSources, importSourceSchema } from "@/lib/crawl-sources";

// POST /api/admin/crawl-sources/import: paste-a-list bulk add of crawl
// sources (full-crawler spec WP2). SUPER_ADMIN only (crawler:manage), 503
// crawler_disabled while ENABLE_CRAWLER is off, CSRF-checked, audited per
// created source (crawl_source_imported). Entries may be bare hosts or full
// URLs (the host is extracted) and go through the same validation as a
// single add. Every entry gets its own result — created, exists (already a
// source, or a repeat within this request), blocked (never-crawl list) or
// invalid — so duplicates, blocked hosts and bad lines are reported in the
// results table, never rejected as request errors.

export async function POST(request: Request) {
  if (!crawlerEnabled()) return NextResponse.json({ error: "crawler_disabled" }, { status: 503 });
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = importSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const { results } = await importCrawlSources(parsed.data, auth.session.sub);
  return NextResponse.json({ results });
}
