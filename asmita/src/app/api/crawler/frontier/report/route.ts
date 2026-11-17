import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { frontierReportSchema, reportCrawlPages } from "@/lib/crawl-pages";

// POST /api/crawler/frontier/report (crawler v2 WP3): one outcome per page the
// crawler claimed (fetched, not_modified, gone, blocked, error) plus the
// links it found. The app schedules each page's next visit, stores the new
// in-scope links (deduplicated per source on a keyed digest) and counts the
// pages against the source's budget. The envelope is strict; each page entry
// is validated on its own so one bad entry is skipped without losing the
// rest. Links are never fetched here: only stored, encrypted.
export const dynamic = "force-dynamic";

const REPORT_REQUESTS_PER_HOUR = 600;
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const auth = await authenticateCrawler(request, "frontier-report", REPORT_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return crawlerJson({ error: "payload_too_large" }, 413);
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return crawlerJson({ error: "payload_too_large" }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const parsed = frontierReportSchema.safeParse(json);
  if (!parsed.success) return crawlerJson({ error: "invalid_payload" }, 400);
  const body = parsed.data;
  // Each page entry is checked inside reportCrawlPages, so one malformed
  // entry is skipped without losing the others (as findings are).
  const { accepted } = await reportCrawlPages(body.sourceId, body.runId, body.pages);
  return crawlerJson({ accepted });
}
