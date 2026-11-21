import { safeEqual } from "@/lib/safe-equal";
import { NextResponse, type NextRequest } from "next/server";
import { labEnabled } from "@/lib/lab/flags";
import { runLabLivenessCheck } from "@/lib/lab/lab-liveness";

// E2 (docs/lab/charter.md): the daily liveness check, wired as the Cron
// Trigger route "45 2 * * *" (cloudflare-worker.ts, wrangler.jsonc). Like
// every cron route it answers only with the CRON_SECRET bearer; it lives
// under /api/lab because it is lab code — the charter's boundary keeps it
// importable only from lab paths. While ENABLE_LAB is off it skips itself
// (a skipped cron must not page anyone); on, it HEAD-checks every tracked
// service URL — the one place in the app, outside the crawler service,
// that fetches — and records the pass.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;
  if (!labEnabled()) {
    return NextResponse.json({ skipped: "lab_disabled" });
  }
  try {
    const result = await runLabLivenessCheck();
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
