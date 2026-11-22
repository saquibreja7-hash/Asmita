import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { crawlEmbeddingsBodySchema, recordCrawlEmbeddings } from "@/lib/crawl-embeddings";
import { sscdEnabled } from "@/lib/crawler-flags";
import { logSecurityEvent } from "@/lib/security-log";

// POST /api/crawler/embeddings: SSCD descriptors of copies the crawler already
// matched (ADR 008, WP28). The app stores one only for a finding an analyst
// has APPROVED under a live authorisation; anything else is discarded with a
// per-item reason. A vector is encrypted at rest, never logged, never in an
// audit entry; the addresses only locate the confirmed finding and follow the
// finding rules (never fetched, never stored here).
//
// A malformed envelope (not JSON, bad runId, not 1..50 embeddings, unknown
// field) is refused whole with 400, exactly like the findings route. While
// ENABLE_CRAWLER or ENABLE_SSCD is off the route answers 503
// crawler_disabled: nothing changes when the second layer is switched off.
export const dynamic = "force-dynamic";

const EMBEDDING_REQUESTS_PER_HOUR = 120;
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const auth = await authenticateCrawler(request, "embeddings", EMBEDDING_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;

  // The same refusal as a switched-off crawler: the route itself is inert
  // until the owner turns the second layer on.
  if (!sscdEnabled()) return crawlerJson({ error: "crawler_disabled" }, 503);

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
  const parsed = crawlEmbeddingsBodySchema.safeParse(json);
  if (!parsed.success) return crawlerJson({ error: "invalid_payload" }, 400);
  const { results, mediaRejected } = await recordCrawlEmbeddings(parsed.data);
  if (mediaRejected) await logSecurityEvent({ event: "media_payload_rejected", route: "/api/crawler/embeddings" });
  return crawlerJson({ results });
}
