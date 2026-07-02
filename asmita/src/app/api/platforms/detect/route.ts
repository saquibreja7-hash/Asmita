import { NextResponse } from "next/server";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

export async function GET(request: Request) {
  const ipLimit = await checkRateLimitAsync(
    `platform-detect:${getClientIp(request)}`,
    60,
    60 * 60_000,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const submitted = new URL(request.url).searchParams.get("url");
  if (!submitted) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  const parsed = parseSubmittedUrl(submitted);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  return NextResponse.json({
    domain: parsed.domain,
    platformName: parsed.platform?.name || "Unknown - will be reviewed",
    tier: parsed.platform?.tier || null,
  });
}
