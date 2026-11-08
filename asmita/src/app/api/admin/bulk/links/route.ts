import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import { isAwaitingReview, reviewSubmittedUrl } from "@/lib/case-ops";
import { writeAuditLog } from "@/lib/audit";

// Approves or rejects up to 50 flagged links at once. Each link goes through
// the same review as the single buttons and gets its own audit entry; links
// no longer waiting for review are skipped, never re-decided. Nothing here
// sends anything outside Asmita: approval only queues a link for a notice the
// survivor still has to sign. Fingerprints are not bulk-reviewable because
// approving one can email a platform straight away.
const MAX_BULK_LINKS = 50;

const schema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    urlIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_BULK_LINKS),
    // The survivor sees a rejection, so it needs a reason.
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .refine((value) => value.decision === "approve" || Boolean(value.reason), { message: "reason_required" });

type ItemResult = { urlId: string; ok: true } | { urlId: string; ok: false; error: string };

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((issue) => issue.message === "reason_required");
    return NextResponse.json({ error: reasonMissing ? "reason_required" : "invalid_payload" }, { status: 400 });
  }
  const { decision, reason } = parsed.data;
  const urlIds = Array.from(new Set(parsed.data.urlIds));

  const links = await db.submittedUrl.findMany({
    where: { id: { in: urlIds } },
    select: { id: true, caseId: true, status: true, flaggedForReview: true },
  });
  const byId = new Map(links.map((link) => [link.id, link]));

  const results: ItemResult[] = [];
  for (const urlId of urlIds) {
    const link = byId.get(urlId);
    if (!link) {
      results.push({ urlId, ok: false, error: "url_not_found" });
      continue;
    }
    if (!isAwaitingReview(link)) {
      results.push({ urlId, ok: false, error: "not_awaiting_review" });
      continue;
    }
    try {
      await reviewSubmittedUrl({ caseId: link.caseId, urlId, decision, reviewerId: auth.session.sub, reason });
      results.push({ urlId, ok: true });
    } catch (err) {
      results.push({ urlId, ok: false, error: err instanceof Error ? err.message : "review_failed" });
    }
  }

  const succeeded = results.filter((result) => result.ok).length;
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "SubmittedUrl",
    entityId: "bulk",
    actorId: auth.session.sub,
    data: { action: "bulk_link_review", decision, requested: urlIds.length, succeeded, failed: urlIds.length - succeeded },
  });

  // Failures first, so the operator sees what still needs them.
  results.sort((left, right) => Number(left.ok) - Number(right.ok));
  return NextResponse.json({ decision, succeeded, failed: urlIds.length - succeeded, results });
}
