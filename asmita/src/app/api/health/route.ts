import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "asmita",
    db: process.env.DATABASE_URL ? "configured" : "not_configured",
    redis: process.env.REDIS_URL ? "configured" : "not_configured",
  });
}
