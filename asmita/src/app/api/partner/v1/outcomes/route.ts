import { z } from "zod";
import { authenticatePartner, partnerJson, readPartnerBody } from "@/lib/partner-auth";
import { PARTNER_OUTCOMES, recordPartnerOutcome } from "@/lib/partner-outcomes";

/*
 * POST /api/partner/v1/outcomes (WP32, partner-sharing-spec.md): a partner
 * platform reports what it did with what Asmita sent it — a fingerprint from
 * the feed, and/or a URL, which must be on the partner's own registered
 * domains (Rule 6: a partner can never report about another partner's pages).
 *
 * Partner key only, rate limited, body capped and validated with a strict Zod
 * schema (Rule 6). Stored as PartnerOutcome, audited with ids and counts
 * only; a "removed" outcome on a reported link updates that link's status
 * exactly like an admin-recorded removal. The response says only that the
 * report was accepted — never whether Asmita knew the URL, never any case
 * data beyond what the partner already holds.
 */

export const dynamic = "force-dynamic";

const OUTCOME_REQUESTS_PER_HOUR = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const outcomeSchema = z
  .object({
    fingerprintId: z.string().regex(UUID).optional(),
    url: z.string().trim().min(3).max(2048).optional(),
    outcome: z.enum(PARTNER_OUTCOMES),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => data.fingerprintId !== undefined || data.url !== undefined, { message: "nothing_to_report" });

const ERROR_STATUS: Record<string, number> = {
  partner_not_found: 404,
  partner_suspended: 403,
  unknown_fingerprint: 404,
  invalid_url: 400,
  url_not_on_partner_domain: 403,
};

export async function POST(request: Request) {
  const auth = await authenticatePartner(request, "v1/outcomes", OUTCOME_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;

  const body = await readPartnerBody(request, outcomeSchema);
  if (!body.ok) {
    return partnerJson({ error: body.error }, body.error === "payload_too_large" ? 413 : 400);
  }

  const result = await recordPartnerOutcome(auth.partnerId, body.value);
  if (!result.ok) {
    return partnerJson({ error: result.error }, ERROR_STATUS[result.error] ?? 400);
  }
  return partnerJson({ ok: true });
}
