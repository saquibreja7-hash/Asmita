import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labProviderUpdateSchema, updateLabProvider } from "@/lib/lab/infra/store";

// WP115 (research-tools-spec.md): edit a provider row or mark it verified.
// `verified` records who verified it and when; un-verifying clears both.
// Same gates as POST /api/lab/providers.

const CHANGES_PER_HOUR = 120;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const { id } = await context.params;
  const parsed = labProviderUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-provider-changes:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await updateLabProvider(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, result.error === "provider_not_found" ? 404 : 400);
  return noStore({ provider: result.provider });
}
