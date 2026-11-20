import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labReportOutcomeSchema, recordLabReportOutcome } from "@/lib/lab/lab-reports";

// E2: record what the provider did with a sent report — actioned, refused,
// or no reply — with the date and, if one was given, the provider's own
// reference. The E2 metric reads these outcomes.

const OUTCOMES_PER_HOUR = 120;
const STATUS: Record<string, number> = {
  invalid_payload: 400,
  report_not_found: 404,
  report_not_sent: 409,
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labReportOutcomeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-report-outcomes:${auth.session.sub}`, OUTCOMES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const { id } = await context.params;
  const result = await recordLabReportOutcome(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ report: result.report });
}
