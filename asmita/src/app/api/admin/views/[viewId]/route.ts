import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { deleteSavedView } from "@/lib/admin-saved-views";

export async function DELETE(request: Request, context: { params: Promise<{ viewId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { viewId } = await context.params;
  const deleted = await deleteSavedView(auth.session.emailHash, viewId);
  return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "view_not_found" }, { status: 404 });
}
