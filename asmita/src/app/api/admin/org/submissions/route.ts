import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { ORG_SUBMISSION_KINDS, ORG_SUBMISSION_STATUSES, listOrgSubmissions } from "@/lib/org-submissions";

// The outreach inbox (docs/org/spec.md, 56.2): submissions read with kind
// and status filters, newest first. Writes are on [id]; the CSV export is
// a separate GET. outreach:manage.

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
  const submissions = await listOrgSubmissions(parsed.data);
  return NextResponse.json({ submissions }, { headers: { "Cache-Control": "no-store" } });
}
