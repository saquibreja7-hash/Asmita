import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

// Records what a platform did with a notice. A removal also marks the link
// removed, which stops its escalation ladder (the same as the survivor's own
// "mark removed"). An acknowledgement or refusal stops the 24-hour follow-up,
// as escalation-engine.ts already does for a platform that answered; the
// survivor's own next steps stay open.
const schema = z
  .object({
    responseType: z.enum(["ACKNOWLEDGED", "REMOVED", "REJECTED"]),
    receivedAt: z.string().datetime().optional(),
  })
  .strict();

// Allows for a browser clock a little ahead of the server's.
const CLOCK_SKEW_MS = 5 * 60_000;

export async function POST(request: Request, context: { params: Promise<{ noticeId: string }> }) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { noticeId } = await context.params;
  const notice = await db.notice.findUnique({
    where: { id: noticeId },
    select: {
      id: true,
      urlId: true,
      sentAt: true,
      followUpOf: true,
      removedAt: true,
      submittedUrl: { select: { caseId: true, status: true } },
    },
  });
  if (!notice) return NextResponse.json({ error: "notice_not_found" }, { status: 404 });
  // Replies belong to the original notice; follow-ups share its ladder.
  if (notice.followUpOf) return NextResponse.json({ error: "follow_up_notice" }, { status: 409 });
  if (!notice.sentAt) return NextResponse.json({ error: "notice_not_sent" }, { status: 409 });
  if (notice.removedAt || notice.submittedUrl.status === "REMOVED") {
    return NextResponse.json({ error: "already_removed" }, { status: 409 });
  }

  const now = Date.now();
  const receivedAt = parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(now);
  if (receivedAt.getTime() > now + CLOCK_SKEW_MS) {
    return NextResponse.json({ error: "reply_in_future" }, { status: 400 });
  }
  if (receivedAt.getTime() < notice.sentAt.getTime()) {
    return NextResponse.json({ error: "reply_before_notice" }, { status: 400 });
  }

  const { responseType } = parsed.data;
  const removed = responseType === "REMOVED";
  // The removal guard is in the updates themselves, so two admins recording
  // at once cannot both record a removal; replies before it may still be
  // changed (acknowledged, then removed).
  const [noticeUpdate] = await db.$transaction([
    db.notice.updateMany({
      where: { id: notice.id, removedAt: null },
      data: { responseType, responseReceivedAt: receivedAt, ...(removed ? { removedAt: receivedAt } : {}) },
    }),
    ...(removed
      ? [db.submittedUrl.updateMany({ where: { id: notice.urlId, status: { not: "REMOVED" } }, data: { status: "REMOVED" } })]
      : []),
  ]);
  if (noticeUpdate.count === 0) return NextResponse.json({ error: "already_removed" }, { status: 409 });

  await writeAuditLog({
    eventType: removed ? "CONTENT_REMOVED" : "ADMIN_ACTION",
    entityType: removed ? "SubmittedUrl" : "Notice",
    entityId: removed ? notice.urlId : notice.id,
    actorId: auth.session.sub,
    data: {
      action: "platform_reply_recorded",
      noticeId: notice.id,
      caseId: notice.submittedUrl.caseId,
      responseType,
      receivedAt: receivedAt.toISOString(),
    },
  });

  return NextResponse.json({ ok: true, responseType, receivedAt: receivedAt.toISOString() });
}
