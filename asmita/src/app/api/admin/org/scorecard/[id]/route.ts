import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import {
  getScorecardSnapshotById,
  publishScorecardSnapshot,
  saveScorecardNote,
  scorecardNoteSchema,
  scorecardPublishSchema,
} from "@/lib/scorecard-snapshots";

// One snapshot: GET shows it (the table the admin reviews); PUT either
// saves the methodology note (drafts only) or publishes ({ publish: true }).
// content:manage; CSRF, rate limit and audit live in the store.

const MAX_BODY_BYTES = 16 * 1024;
const MAX_WRITES_PER_HOUR = 100;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  const snapshot = await getScorecardSnapshotById(id);
  if (!snapshot) return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });
  return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/org/scorecard/[id]" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("content:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await checkRateLimitAsync(`admin-org-scorecard:${auth.session.sub}`, MAX_WRITES_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const { id } = await context.params;

  const publish = scorecardPublishSchema.safeParse(body);
  if (publish.success) {
    const result = await publishScorecardSnapshot(id, auth.session.sub);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.error === "snapshot_not_found" ? 404 : 409 });
    }
    return NextResponse.json({ snapshot: result.snapshot });
  }

  const note = scorecardNoteSchema.safeParse(body);
  if (!note.success) {
    const field = note.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const result = await saveScorecardNote(id, note.data, auth.session.sub);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "snapshot_not_found" ? 404 : 409 });
  }
  return NextResponse.json({ snapshot: result.snapshot });
}
