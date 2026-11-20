import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labEnabled } from "@/lib/lab/flags";
import { draftLabReport, labReportDraftSchema, listLabReports } from "@/lib/lab/lab-reports";

// E2 (docs/lab/charter.md): chokepoint reports. POST drafts one from the
// per-kind template filled with the service's data — nothing is sent here;
// the analyst reviews the text, then sends it (email or web form) at
// /api/lab/reports/[id]/send and records the outcome at .../outcome.

const DRAFTS_PER_HOUR = 60;
const STATUS: Record<string, number> = { invalid_payload: 400, chokepoint_not_found: 404 };

export async function GET() {
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const reports = await listLabReports();
  return noStore({ reports, labEnabled: labEnabled() });
}

export async function POST(request: Request) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labReportDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-report-drafts:${auth.session.sub}`, DRAFTS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await draftLabReport(parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ report: result.report }, 201);
}
