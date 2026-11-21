import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { labReportSendSchema, sendLabReport } from "@/lib/lab/lab-reports";

// E2: send a reviewed report. EMAIL goes out through the existing Resend
// sender under the lab sender address, idempotent per report; WEB_FORM
// records that the analyst submitted the provider's own form with the
// copied text. Either way the stored text becomes the record.

const SENDS_PER_HOUR = 30;
const STATUS: Record<string, number> = {
  invalid_payload: 400,
  report_not_found: 404,
  report_already_sent: 409,
  email_send_failed: 502,
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const parsed = labReportSendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-report-sends:${auth.session.sub}`, SENDS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const { id } = await context.params;
  const result = await sendLabReport(id, parsed.data, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, STATUS[result.error] ?? 400);
  return noStore({ report: result.report, messageId: result.messageId });
}
