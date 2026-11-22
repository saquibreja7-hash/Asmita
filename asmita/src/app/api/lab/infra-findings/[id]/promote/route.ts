import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { promoteFindingSchema, promoteFindingToChokepoint } from "@/lib/lab/infra/promote";

// WP115 (research-tools-spec.md): promote one infrastructure finding to a
// chokepoint in one action. The provider comes from the directory, the kind
// is mapped from the finding's category, the evidence notes are pre-filled,
// and the abuse contact comes from the directory only when the provider row
// is verified — otherwise the analyst must enter it. Same gates as every
// lab mutation.

const PROMOTIONS_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  invalid_payload: 400,
  finding_not_found: 404,
  finding_inactive: 409,
  finding_already_promoted: 409,
  category_not_promotable: 422,
  provider_required: 422,
  provider_not_found: 404,
  provider_kind_mismatch: 422,
  abuse_contact_required: 422,
  service_not_found: 404,
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const { id } = await context.params;
  const parsed = promoteFindingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-finding-promotions:${auth.session.sub}`, PROMOTIONS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await promoteFindingToChokepoint(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ chokepoint: result.chokepoint, provider: result.provider }, 201);
}
