import { authenticatePartner, partnerJson } from "@/lib/partner-auth";
import {
  getPartnerSignalPage,
  parsePartnerSignalCheckpoint,
  PARTNER_SIGNALS_DEFAULT_PAGE,
  PARTNER_SIGNALS_MAX_PAGE,
} from "@/lib/partner-feed";

/*
 * GET /api/partner/v1/signals?checkpoint=<opaque>&page_size=<1..800>
 * (WP110, research-tools spec): the same append-only event log as
 * /fingerprints, served the way Meta's Hasher-Matcher-Actioner consumes a
 * signal exchange — an opaque checkpoint that never moves backwards, records
 * ordered strictly by (createdAt, seq) with the seq breaking millisecond
 * ties, an explicit deleted:true tombstone (hash null) for every withdrawal,
 * and the same serve-time shareability re-check as /fingerprints (the same
 * function, never a copy): an ADD that fails it is skipped while the
 * checkpoint still advances past it.
 *
 * Partner key with the "feed" scope only (WP110 scopes), the same IP and
 * per-key rate limits as the other routes under its own bucket, and
 * Cache-Control: no-store. Nothing is logged but counts.
 */

export const dynamic = "force-dynamic";

const SIGNALS_REQUESTS_PER_HOUR = 300;

export async function GET(request: Request) {
  const auth = await authenticatePartner(request, "signals", SIGNALS_REQUESTS_PER_HOUR, "feed");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  // Missing or empty: the beginning. Anything else that is not exactly a
  // checkpoint Asmita minted: 400, so a silent mis-parse can never skip data.
  const checkpointParam = params.get("checkpoint");
  let start = null;
  if (checkpointParam !== null && checkpointParam !== "") {
    start = parsePartnerSignalCheckpoint(checkpointParam);
    if (!start) return partnerJson({ error: "invalid_checkpoint" }, 400);
  }

  const pageSizeParam = params.get("page_size");
  let pageSize = PARTNER_SIGNALS_DEFAULT_PAGE;
  if (pageSizeParam !== null) {
    if (!/^\d{1,3}$/.test(pageSizeParam) || Number(pageSizeParam) < 1 || Number(pageSizeParam) > PARTNER_SIGNALS_MAX_PAGE) {
      return partnerJson({ error: "invalid_page_size" }, 400);
    }
    pageSize = Number(pageSizeParam);
  }

  const page = await getPartnerSignalPage(start, pageSize);
  return partnerJson(page);
}
