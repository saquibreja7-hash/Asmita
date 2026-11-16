import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import {
  createCrawlSource,
  createSourceSchema,
  listCrawlSources,
  updateCrawlSource,
  updateSourceSchema,
} from "@/lib/crawl-sources";

// The sites the crawler may visit (src/lib/crawl-sources.ts). SUPER_ADMIN
// only (crawler:manage). Every change is audited.

const STATUS: Record<string, number> = { invalid_domain: 400, private_domain: 400, source_exists: 409, source_not_found: 404 };

export async function GET() {
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ sources: await listCrawlSources() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await createCrawlSource(parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ source: result.source }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("crawler:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = updateSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await updateCrawlSource(parsed.data, auth.session.sub);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ source: result.source });
}
