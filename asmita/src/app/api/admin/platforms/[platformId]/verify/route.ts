import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z
  .object({
    sourceUrl: z.string().url(),
    // The contactChangedAt the verifier was shown (null if never edited in
    // the console). A mismatch means the contact changed since they looked.
    contactChangedAt: z.string().datetime().nullable(),
  })
  .strict();

/**
 * Marks a platform's contact verified by a human. The verifier must be a
 * different admin from the one who last changed the contact fields, so one
 * admin (or one stolen session) cannot both repoint and verify a contact.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ platformId: string }> },
) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("platforms:edit");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { platformId } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { sourceUrl, contactChangedAt } = parsed.data;

  const current = await db.platform.findUnique({ where: { id: platformId } });
  if (!current) {
    return NextResponse.json({ error: "platform_not_found" }, { status: 404 });
  }
  if (current.contactChangedBy && current.contactChangedBy === auth.session.emailHash) {
    return NextResponse.json({ error: "second_admin_required" }, { status: 403 });
  }
  const seen = contactChangedAt ? new Date(contactChangedAt).getTime() : null;
  if ((current.contactChangedAt?.getTime() ?? null) !== seen) {
    return NextResponse.json({ error: "contact_changed" }, { status: 409 });
  }

  // Conditional on the contact being exactly the one checked above, so an
  // edit that lands between the read and this write is never verified.
  const verifiedAt = new Date();
  const result = await db.platform.updateMany({
    where: {
      id: platformId,
      contactChangedBy: current.contactChangedBy,
      contactChangedAt: current.contactChangedAt,
    },
    data: { lastContactVerifiedByHuman: true, lastContactVerifiedAt: verifiedAt },
  });
  if (result.count !== 1) {
    return NextResponse.json({ error: "contact_changed" }, { status: 409 });
  }

  await writeAuditLog({
    eventType: "GO_CONTACT_VERIFIED",
    entityType: "Platform",
    entityId: platformId,
    actorId: auth.session.sub,
    data: {
      platformName: current.name,
      sourceUrl,
      contactChangedAt: current.contactChangedAt?.toISOString() ?? null,
      verifiedAt: verifiedAt.toISOString(),
    },
  });

  return NextResponse.json({ success: true, verifiedAt: verifiedAt.toISOString() });
}
