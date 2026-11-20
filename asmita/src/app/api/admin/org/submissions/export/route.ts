import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { ORG_SUBMISSION_KINDS, ORG_SUBMISSION_STATUSES, exportOrgSubmissionsCsv } from "@/lib/org-submissions";

// CSV export of the filtered submission list (56.2), audit-logged in the
// store. GET: an export reads and never mutates, so no CSRF token applies,
// but it still needs outreach:manage.

const querySchema = z.object({
  kind: z.enum(ORG_SUBMISSION_KINDS).optional(),
  status: z.enum(ORG_SUBMISSION_STATUSES).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAdminPermission("outreach:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const csv = await exportOrgSubmissionsCsv(parsed.data, auth.session.sub);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="org-submissions.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
