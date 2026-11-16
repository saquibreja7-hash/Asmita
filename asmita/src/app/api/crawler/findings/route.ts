import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { crawlFindingsBodySchema, recordCrawlFindings } from "@/lib/crawl-findings";
import { logSecurityEvent } from "@/lib/security-log";

// POST /api/crawler/findings: possible copies the crawler found. URLs are
// strings only: validated, encrypted and stored, never fetched or logged.
// A malformed batch (shape, size, distance range, media-like payload) is
// refused whole with 400; a well-formed item that cannot be accepted is
// "rejected" in its own result, index-aligned with the input.
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
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.message === "media_payload_rejected")) {
      await logSecurityEvent({ event: "media_payload_rejected", route: "/api/crawler/findings" });
    }
    return crawlerJson({ error: "invalid_payload" }, 400);
  }
  return crawlerJson({ results: await recordCrawlFindings(parsed.data, auth.keyId) });
}
