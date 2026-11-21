import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labEnabled } from "@/lib/lab/flags";
import { createLabChokepoint, labChokepointInputSchema, listLabChokepoints } from "@/lib/lab/lab-chokepoints";

// E2 (docs/lab/charter.md): the chokepoints — the providers a tracked
// service depends on, each with the abuse contact an analyst copied from
// that provider's own abuse page. Same gates as the services routes.

const CHANGES_PER_HOUR = 120;
const STATUS: Record<string, number> = { invalid_payload: 400, service_not_found: 404 };

export async function GET() {
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const chokepoints = await listLabChokepoints();
  return noStore({ chokepoints, labEnabled: labEnabled() });
}

export async function POST(request: Request) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labChokepointInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-chokepoint-changes:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await createLabChokepoint(parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ chokepoint: result.chokepoint }, 201);
}
