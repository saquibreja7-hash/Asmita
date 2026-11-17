import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { discoveriesSchema, recordCrawlDiscoveries } from "@/lib/crawl-discoveries";

// POST /api/crawler/discoveries (crawler v2 WP5): the out-of-scope hosts the
// crawler saw linked from in-scope pages — hosts only, never links, at most
// 200 per request, deduplicated by the crawler per run. The app applies the
// discovery rules: never-crawl hosts and hosts that are already sources are
// skipped; the rest become DISCOVERED sources one hop deeper than the
// reporting source, enabled automatically within the hop limit and the daily
// new-site cap, stored disabled beyond it. Hosts only are ever stored, and
// nothing here fetches anything (rule 5).
export const dynamic = "force-dynamic";

const DISCOVERY_REQUESTS_PER_HOUR = 600;
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const auth = await authenticateCrawler(request, "discoveries", DISCOVERY_REQUESTS_PER_HOUR);
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
  const parsed = discoveriesSchema.safeParse(json);
  if (!parsed.success) return crawlerJson({ error: "invalid_payload" }, 400);
  const body = parsed.data;
  const { accepted } = await recordCrawlDiscoveries(body.sourceId, body.runId, body.hosts, new Date(), auth.keyId);
  return crawlerJson({ accepted });
}
