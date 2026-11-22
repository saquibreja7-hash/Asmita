import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labEnabled } from "@/lib/lab/flags";
import { createLabProvider, labProviderInputSchema, listLabProviders } from "@/lib/lab/infra/store";

// WP115 (research-tools-spec.md): the provider directory's admin routes —
// the companies a report can go to, with the policy and abuse pages an
// analyst verifies against the provider's own site. Same gates as the other
// lab routes: reads work while ENABLE_LAB is off, every change is refused
// with 503 lab_disabled, CSRF-checked, Zod-validated, rate-limited per
// admin, and audited in infra/store.ts.

const CHANGES_PER_HOUR = 120;

export async function GET() {
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const providers = await listLabProviders();
  return noStore({ providers, labEnabled: labEnabled() });
}

export async function POST(request: Request) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labProviderInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-provider-changes:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await createLabProvider(parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, result.error === "provider_exists" ? 409 : 400);
  return noStore({ provider: result.provider }, 201);
}
