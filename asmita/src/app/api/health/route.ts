import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-equal";

/*
 * Public liveness probe. Configuration detail is only returned to callers
 * presenting the cron secret, so the public response reveals nothing about
 * the deployment.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({
      ok: true,
      service: "asmita",
      db: process.env.DATABASE_URL ? "configured" : "not_configured",
      redis: process.env.REDIS_URL ? "configured" : "not_configured",
    });
  }
  return NextResponse.json({ ok: true });
}
