import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";

const fieldSchema = z
  .object({
    grievanceEmail: z.string().email().nullable().optional(),
    grievanceName: z.string().min(1).max(120).nullable().optional(),
    grievanceAddress: z.string().min(1).max(500).nullable().optional(),
    formUrl: z.string().url().nullable().optional(),
    apiEndpoint: z.string().url().nullable().optional(),
  })
  .strict();

const bodySchema = z
  .object({
    sourceUrl: z.string().url(),
    // Verification is a separate action by a second admin
    // (POST ./verify). Kept in the schema only to refuse it clearly.
    markVerified: z.boolean().optional(),
    fields: fieldSchema,
  })
  .strict();

// Every tracked field is part of the verified contact record, so changing any
// of them withdraws the verification.
const TRACKED_FIELDS = [
  "grievanceEmail",
  "grievanceName",
  "grievanceAddress",
  "formUrl",
  "apiEndpoint",
] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

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
  const { sourceUrl, markVerified, fields } = parsed.data;
  if (markVerified) {
    return NextResponse.json({ error: "verify_separately" }, { status: 400 });
  }

  const current = await db.platform.findUnique({ where: { id: platformId } });
  if (!current) {
    return NextResponse.json({ error: "platform_not_found" }, { status: 404 });
  }

  const diffs: Array<{ field: TrackedField; oldValue: string | null; newValue: string | null }> = [];
  const updateData: Prisma.PlatformUpdateInput = {};

  for (const field of TRACKED_FIELDS) {
    if (!(field in fields)) continue;
    const incoming = (fields[field] ?? null) as string | null;
    const existing = (current[field] ?? null) as string | null;
    if (incoming === existing) continue;
    diffs.push({ field, oldValue: existing, newValue: incoming });
    updateData[field] = incoming;
  }

  if (diffs.length === 0) {
    return NextResponse.json({ success: true, changed: 0, message: "no_changes" });
  }

  // An edit never arrives verified: the same write that changes the contact
  // withdraws the verification and records who changed it, so a different
  // admin has to verify it before anything is sent there again.
  updateData.lastContactVerifiedByHuman = false;
  updateData.lastContactVerifiedAt = null;
  updateData.contactChangedBy = auth.session.emailHash;
  updateData.contactChangedAt = new Date();

  await db.$transaction([
    db.platform.update({ where: { id: platformId }, data: updateData }),
    ...diffs.map((diff) =>
      db.platformGoHistory.create({
        data: {
          platformId,
          fieldName: diff.field,
          oldValue: diff.oldValue,
          newValue: diff.newValue,
          sourceUrl,
          verifiedBy: auth.session.emailHash,
          changedById: auth.session.sub,
        },
      }),
    ),
  ]);

  await writeAuditLog({
    eventType: "GO_DATABASE_CHANGED",
    entityType: "Platform",
    entityId: platformId,
    actorId: auth.session.sub,
    data: {
      platformName: current.name,
      sourceUrl,
      verificationWithdrawn: current.lastContactVerifiedByHuman,
      changes: diffs.map((diff) => ({
        field: diff.field,
        previousValue: diff.oldValue,
        newValue: diff.newValue,
      })),
    },
  });

  return NextResponse.json({ success: true, changed: diffs.length, needsVerification: true });
}
