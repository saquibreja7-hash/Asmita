import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labLookupInputSchema, lookupServiceUrl, rdapConfigured } from "@/lib/lab/lab-lookup";

// E2 helper: suggest the host, name servers and registrar for a service
// URL (DNS plus RDAP), so the analyst can pick the right chokepoint. The
// URL is the analyst's own input and the lookup is best effort — it never
// fetches the service itself, only DNS and the configured RDAP endpoint.

const LOOKUPS_PER_HOUR = 60;

export async function POST(request: Request) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labLookupInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-lookups:${auth.session.sub}`, LOOKUPS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const hints = await lookupServiceUrl(parsed.data.url);
  if (!hints.ok) return noStore({ error: hints.error }, 400);
  return noStore({ hints: { ...hints }, rdapConfigured: rdapConfigured() });
}
