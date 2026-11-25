import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { requireStepUp } from "@/lib/auth/step-up";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

/*
 * Records (or withdraws) a human legal review of one notice template.
 *
 * This is the console path for the rule in CLAUDE.md: only a human legal
 * reviewer sets reviewedByLegal. Code and seeds never do; this route only
 * writes what a signed-in LEGAL_ADVISOR or SUPER_ADMIN (templates:activate)
 * decides, with a fresh authenticator proof, the reviewer's name, and an
 * explicit confirmation that they read the full text. Every decision is in
 * the audit log with the template's version.
 */

const schema = z
  .object({
    decision: z.enum(["approve", "withdraw"]),
    reviewerName: z.string().trim().min(2).max(120),
    confirmedReadFullText: z.literal(true),
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/admin/templates/legal-review" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("templates:activate");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stepUp = requireStepUp(auth.session);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "no_database" }, { status: 503 });
  }

  const { templateId } = await context.params;
  const { db } = await import("@/lib/db");
  const template = await db.noticeTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, templateType: true, version: true, reviewedByLegal: true },
  });
  if (!template) return NextResponse.json({ error: "template_not_found" }, { status: 404 });

  const approve = parsed.data.decision === "approve";
  if (template.reviewedByLegal === approve) {
    return NextResponse.json({ error: approve ? "already_reviewed" : "not_reviewed" }, { status: 409 });
  }

  const updated = await db.noticeTemplate.update({
    where: { id: template.id },
    data: approve
      ? { reviewedByLegal: true, reviewedAt: new Date(), reviewedByName: parsed.data.reviewerName }
      : { reviewedByLegal: false, reviewedAt: null, reviewedByName: null },
    select: { reviewedByLegal: true, reviewedAt: true, reviewedByName: true },
  });

  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "NoticeTemplate",
    entityId: template.id,
    actorId: auth.session.sub,
    data: {
      action: approve ? "TEMPLATE_LEGAL_REVIEW_RECORDED" : "TEMPLATE_LEGAL_REVIEW_WITHDRAWN",
      templateType: template.templateType,
      version: template.version,
      reviewerName: parsed.data.reviewerName,
      role: auth.session.adminRole,
    },
  });

  return NextResponse.json({
    ok: true,
    reviewedByLegal: updated.reviewedByLegal,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    reviewedByName: updated.reviewedByName,
  });
}
