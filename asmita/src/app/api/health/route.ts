import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-equal";
import { probePostgresConnection } from "@/lib/worker-postgres";

/*
 * Public liveness probe. Configuration detail is only returned to callers
 * presenting the cron secret, so the public response reveals nothing about
 * the deployment.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && safeEqual(header, `Bearer ${secret}`)) {
    let database: "ok" | "unavailable" | "not_configured" = "not_configured";
    if (process.env.DATABASE_URL) {
      try {
        database = (await probePostgresConnection()) ? "ok" : "unavailable";
      } catch {
        database = "unavailable";
      }
    }
    return NextResponse.json({
      ok: true,
      service: "asmita",
      db: database,
    });
  }
  return NextResponse.json({ ok: true });
}
