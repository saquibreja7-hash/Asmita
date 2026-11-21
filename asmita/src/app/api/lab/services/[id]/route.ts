import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labServiceUpdateSchema, updateLabService } from "@/lib/lab/lab-services";

// E2: edit one tracked service (name, kind, URLs, status, notes). The lab
// counterpart of the platforms editor: same gates as POST /api/lab/services.

const CHANGES_PER_HOUR = 120;
const STATUS: Record<string, number> = { invalid_payload: 400, service_not_found: 404 };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labServiceUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-service-changes:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const { id } = await context.params;
  const result = await updateLabService(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ service: result.service });
}
