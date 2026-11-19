import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/safe-equal";
import { purgeExpiredCrawlFindings, purgeExpiredCrawlPages, purgeExpiredUrls } from "@/lib/url-retention";
import { sweepDiscoveredCrawlSources } from "@/lib/crawl-discoveries";
import { createReportedSourcesFromSubmittedUrls } from "@/lib/crawl-sources";
import { sweepDueLinkVerifications } from "@/lib/link-verification";
import { sendOnCallAlertFireAndForget } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // All run even if one fails, so no retention can block or skip the others.
  // The discovered-site sweep (crawler v2 WP5) rides the same hourly cron:
  // it resumes expired 30-day pauses and pauses sites whose page budget was
  // spent three days running with no match. The reported-source sweep
  // turns the hosts of survivors' new links into REPORTED crawl sources in a
  // batch with no actor, so no source is created inside her own request. The
  // removal re-check sweep (watch-and-verify WP23) queues each due check of
  // a removed link into the crawler frontier and resolves the checks whose
  // report has arrived.
  const [urls, findings, pages, discovery, reported, verifications] = await Promise.allSettled([
    purgeExpiredUrls(),
    purgeExpiredCrawlFindings(),
    purgeExpiredCrawlPages(),
    sweepDiscoveredCrawlSources(),
    createReportedSourcesFromSubmittedUrls(),
    sweepDueLinkVerifications(),
  ]);
  if (
    urls.status === "fulfilled" && findings.status === "fulfilled" && pages.status === "fulfilled" &&
    discovery.status === "fulfilled" && reported.status === "fulfilled" && verifications.status === "fulfilled"
  ) {
    return NextResponse.json({
      expiredUrlsPurged: urls.value,
      expiredFindingsPurged: findings.value,
      expiredCrawlPagesPurged: pages.value,
      discoveredSourcesPaused: discovery.value.paused,
      discoveredSourcesResumed: discovery.value.resumed,
      reportedSourcesCreated: reported.value.created,
      verificationsEnqueued: verifications.value.enqueued,
      verificationsResolved: verifications.value.resolved,
      verificationsStillOnline: verifications.value.stillOnline,
    });
  }
  sendOnCallAlertFireAndForget({
    severity: "critical",
    title: "URL retention cleanup failed",
    description: "The scheduled URL cleanup failed; investigate the cleanup job and database.",
    route: "/api/cron/purge-expired-urls",
  });
  return NextResponse.json({ error: "url_cleanup_failed" }, { status: 500 });
}
