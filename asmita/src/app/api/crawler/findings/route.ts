import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { crawlFindingsBodySchema, recordCrawlFindings } from "@/lib/crawl-findings";
import { logSecurityEvent } from "@/lib/security-log";

// POST /api/crawler/findings: possible copies the crawler found. URLs are
// strings only: validated, encrypted and stored, never fetched or logged.
// A malformed envelope (not JSON, bad runId, not 1..50 findings, unknown
// field) is refused whole with 400. Each finding is then checked on its own
// (shape, http(s) URL, distance 0..31, media-like payload, private host,
// source, fingerprint) and a bad one is "rejected" in its own result,
// index-aligned with the input.
export const dynamic = "force-dynamic";

const FINDING_REQUESTS_PER_HOUR = 600;
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const auth = await authenticateCrawler(request, "findings", FINDING_REQUESTS_PER_HOUR);
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
  const parsed = crawlFindingsBodySchema.safeParse(json);
  if (!parsed.success) return crawlerJson({ error: "invalid_payload" }, 400);
  const { results, mediaRejected } = await recordCrawlFindings(parsed.data, auth.keyId);
  if (mediaRejected) await logSecurityEvent({ event: "media_payload_rejected", route: "/api/crawler/findings" });
  return crawlerJson({ results });
}
