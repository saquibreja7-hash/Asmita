import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { softDeleteCaseNote } from "@/lib/case-notes";

// DELETE /api/admin/case-notes/[noteId] — soft-delete one internal case
// note (WP142). Only the author or a SUPER_ADMIN; the library checks, the
// row keeps its text (deletedAt set), and the audit event records the ids
// only. A retried delete of an already-deleted note is a plain 404, so a
// retry after a lost response is safe.

export async function DELETE(request: Request, context: { params: Promise<{ noteId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { noteId } = await context.params;
  const result = await softDeleteCaseNote({
    noteId,
    viewerEmailHash: auth.session.emailHash,
    role: auth.session.adminRole,
    actorId: auth.session.sub,
  });
  if (!result.ok) {
    const status = result.error === "permission_denied" ? 403 : result.error === "note_not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
