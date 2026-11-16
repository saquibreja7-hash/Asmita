import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/safe-equal";
import { purgeExpiredCrawlFindings, purgeExpiredUrls } from "@/lib/url-retention";
import { sendOnCallAlertFireAndForget } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Both run even if one fails, so neither retention can block the other.
  const [urls, findings] = await Promise.allSettled([purgeExpiredUrls(), purgeExpiredCrawlFindings()]);
  if (urls.status === "fulfilled" && findings.status === "fulfilled") {
    return NextResponse.json({ expiredUrlsPurged: urls.value, expiredFindingsPurged: findings.value });
  }
  sendOnCallAlertFireAndForget({
    severity: "critical",
    title: "URL retention cleanup failed",
    description: "The scheduled URL cleanup failed; investigate the cleanup job and database.",
    route: "/api/cron/purge-expired-urls",
  });
  return NextResponse.json({ error: "url_cleanup_failed" }, { status: 500 });
}
