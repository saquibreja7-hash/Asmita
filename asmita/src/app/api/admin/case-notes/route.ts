import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { addCaseNote, CASE_NOTE_MAX } from "@/lib/case-notes";

// POST /api/admin/case-notes — write one internal case note (WP142). The
// cases:note permission is enforced in the library, the body is capped,
// anything address-like is refused, and the note is encrypted before it is
// stored. The audit event carries ids only, never the text.

const schema = z
  .object({
    caseId: z.string().trim().min(1).max(64),
    jobId: z.string().trim().min(1).max(64).optional(),
    body: z.string().max(CASE_NOTE_MAX),
  })
  .strict();

const NOTES_PER_HOUR = 120;

const STATUS: Record<string, number> = {
  permission_denied: 403,
  case_not_found: 404,
  note_required: 400,
  note_too_long: 400,
  links_not_allowed: 400,
};

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const limit = await checkRateLimitAsync(`admin-case-notes:${auth.session.sub}`, NOTES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await addCaseNote({
    caseId: parsed.data.caseId,
    jobId: parsed.data.jobId ?? null,
    body: parsed.data.body,
    authorEmailHash: auth.session.emailHash,
    authorId: auth.session.sub,
    role: auth.session.adminRole,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 409 });
  return NextResponse.json({ ok: true, note: { id: result.note.id, createdAt: result.note.createdAt } });
}
