import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labChokepointUpdateSchema, updateLabChokepoint } from "@/lib/lab/lab-chokepoints";

// E2: edit one chokepoint (kind, provider, abuse contact, evidence notes).
// The abuse contact is the analyst's record; changing it is audited like
// every other lab change.

const CHANGES_PER_HOUR = 120;
const STATUS: Record<string, number> = { invalid_payload: 400, chokepoint_not_found: 404 };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labChokepointUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-chokepoint-changes:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const { id } = await context.params;
  const result = await updateLabChokepoint(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ chokepoint: result.chokepoint });
}
