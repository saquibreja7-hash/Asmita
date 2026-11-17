import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { getCrawlerStats } from "@/lib/crawl-stats";

// GET /api/admin/crawler/stats (crawler v2 WP8): the address-free aggregates
// behind the read-only /admin/crawler overview page. findings:review, like
// the findings console. The body is counts, timestamps and a run id only —
// never a host, URL, fingerprint or case reference — so it is safe to read
// with the crawler off and nothing here can reveal an address.

export async function GET() {
  const auth = await requireAdminPermission("findings:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(
    { stats: await getCrawlerStats(), crawlerEnabled: crawlerEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
