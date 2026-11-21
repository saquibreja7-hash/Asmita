import { safeEqual } from "@/lib/safe-equal";
import { NextResponse, type NextRequest } from "next/server";
import { labEnabled } from "@/lib/lab/flags";
import { runInfraScanRun } from "@/lib/lab/infra/run";

// WP114 (research-tools-spec.md): the weekly infrastructure scan, wired as
// the Cron Trigger route "30 3 * * 1" (cloudflare-worker.ts, wrangler.jsonc).
// Like every cron route it answers only with the CRON_SECRET bearer; it is
// lab code, so the charter's boundary keeps it under /api/lab. While
// ENABLE_LAB is off it skips itself (a skipped cron must not page anyone).
// Caps per run: 100 services, 300 URLs (run.ts).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;
  if (!labEnabled()) {
    return NextResponse.json({ skipped: "lab_disabled" });
  }
  try {
    const result = await runInfraScanRun("cron");
    return NextResponse.json({ ran: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ran: false, error: message }, { status: 500 });
  }
}

function verifyCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
