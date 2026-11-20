import { authenticatePartner, partnerJson } from "@/lib/partner-auth";
import { getPartnerFeedPage, PARTNER_FEED_MAX_PAGE } from "@/lib/partner-feed";

/*
 * GET /api/partner/v1/fingerprints?cursor=<last seq>&limit=<1..500>
 * (WP32, partner-sharing-spec.md): the append-only feed of fingerprints
 * Asmita may share with partner platforms, ordered by a monotonic sequence.
 *
 * Partner key only (WP30's authenticatePartner: hashed lookup, constant-time
 * compare, revocation and suspension honoured, IP and per-key rate limits).
 * A page carries at most 500 events; nextCursor is the seq of the last event
 * when more may follow, and absent when the partner is up to date. An ADD
 * event carries the fingerprint's hash only while it is still shareable
 * (Rule 2 re-checked at serve time), so a withdrawn, rejected, unconsented
 * or minor fingerprint never appears here. Nothing is logged but counts.
 */

export const dynamic = "force-dynamic";

const FEED_REQUESTS_PER_HOUR = 300;

export async function GET(request: Request) {
  const auth = await authenticatePartner(request, "v1/fingerprints", FEED_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const cursorParam = params.get("cursor");
  let cursor = 0;
  if (cursorParam !== null) {
    if (!/^\d{1,15}$/.test(cursorParam)) return partnerJson({ error: "invalid_cursor" }, 400);
    cursor = Number(cursorParam);
  }
  const limitParam = params.get("limit");
  let limit = PARTNER_FEED_MAX_PAGE;
  if (limitParam !== null) {
    if (!/^\d{1,3}$/.test(limitParam) || Number(limitParam) < 1 || Number(limitParam) > PARTNER_FEED_MAX_PAGE) {
      return partnerJson({ error: "invalid_limit" }, 400);
    }
    limit = Number(limitParam);
  }

  const page = await getPartnerFeedPage(cursor, limit);
  return partnerJson(page);
}
