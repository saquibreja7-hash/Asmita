import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labEnabled } from "@/lib/lab/flags";
import { createLabService, labServiceInputSchema, listLabServices } from "@/lib/lab/lab-services";

// E2 (docs/lab/charter.md): the tracked services themselves. Reads work
// while ENABLE_LAB is off (analysts can see history); every change is
// refused with 503 lab_disabled, CSRF-checked, Zod-validated, rate-limited
// per admin, and audited in lab-services.ts.

const CHANGES_PER_HOUR = 120;

export async function GET() {
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const services = await listLabServices();
  return noStore({ services, labEnabled: labEnabled() });
}

export async function POST(request: Request) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labServiceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-service-changes:${auth.session.sub}`, CHANGES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await createLabService(parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, 400);
  return noStore({ service: result.service }, 201);
}
