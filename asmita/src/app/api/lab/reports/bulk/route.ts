import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { draftBulkLabReport, labBulkReportDraftSchema } from "@/lib/lab/lab-reports";

// WP115 (research-tools-spec.md): draft ONE report to one provider that
// lists several services depending on it. The draft is reviewed, edited,
// sent and recorded through the existing /api/lab/reports/[id] routes —
// exactly like a single-service report — and a sent report never changes.
// Same gates as every lab mutation.

const DRAFTS_PER_HOUR = 60;

const STATUS: Record<string, number> = {
  invalid_payload: 400,
  provider_not_found: 404,
  service_not_found: 404,
  service_not_dependent: 422,
  abuse_contact_required: 422,
};

export async function POST(request: Request) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labBulkReportDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-bulk-report-drafts:${auth.session.sub}`, DRAFTS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await draftBulkLabReport(parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ report: result.report }, 201);
}
