import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { getAdminCaseDetail } from "@/lib/admin-cases";
import { recordAdminAccess } from "@/lib/admin-access-log";

// One case for the list's preview panel: the same data as the case page and
// never a link's text. Opening it is logged like opening the page.
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });

  const { reference } = await context.params;
  const detail = await getAdminCaseDetail(reference);
  if (!detail) return NextResponse.json({ error: "case_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  await recordAdminAccess(
    { adminId: auth.session.sub, action: "case_viewed", entityType: "Case", entityId: detail.caseId },
    request.headers,
  );
  const canReview = hasAdminPermission(auth.session.adminRole, "cases:review");
  return NextResponse.json({ detail, canReview }, { headers: { "Cache-Control": "no-store" } });
}
