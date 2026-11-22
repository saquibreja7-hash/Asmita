import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { getLabService } from "@/lib/lab/lab-services";
import { runInfraScanForService } from "@/lib/lab/infra/run";

// WP114 (research-tools-spec.md): the admin "scan now" action for one
// service — the button WP115 puts on the service page. Like every lab
// mutation it is CSRF-checked, refused with 503 lab_disabled while the Lab
// is off, and rate-limited per admin (20 scans per hour), because a scan
// fetches the service's landing page from this server.

const SCANS_PER_HOUR = 20;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const { id } = await context.params;
  const service = await getLabService(id);
  if (!service || service.urls.length === 0) return noStore({ error: "service_not_found" }, 404);
  const limit = await checkRateLimitAsync(`lab-infra-scan:${auth.session.sub}`, SCANS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await runInfraScanForService(service, "admin");
  return noStore({ ran: true, ...result });
}
