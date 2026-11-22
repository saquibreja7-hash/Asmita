import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { editLabReportDraft, labReportEditSchema } from "@/lib/lab/lab-reports";

// E2: the analyst's review of a draft. The subject and body may change
// until the report is sent; after that the sent text is the record and this
// answers 409 report_already_sent.

const EDITS_PER_HOUR = 120;
const STATUS: Record<string, number> = {
  invalid_payload: 400,
  report_not_found: 404,
  report_already_sent: 409,
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labReportEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-report-edits:${auth.session.sub}`, EDITS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const { id } = await context.params;
  const result = await editLabReportDraft(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ report: result.report });
}
