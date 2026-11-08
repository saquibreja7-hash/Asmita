import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/encryption";
import { isUrlExpired } from "@/lib/url-retention";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { recordAdminAccess, REVEAL_REASONS } from "@/lib/admin-access-log";
import { writeAuditLog } from "@/lib/audit";

// Shows one survivor link to an admin who gives a reason. Logged twice: the
// access log (who, which link, why) and the audit chain. Never cached.

const schema = z.object({ reason: z.enum(REVEAL_REASONS) }).strict();
const REVEALS_PER_HOUR = 20;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ urlId: string }> }) {
  if (!verifyCsrfRequest(request)) return noStore({ error: "csrf_failed" }, 403);
  // Reviewers, not support agents: seeing the link is part of reviewing it.
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "reason_required" }, 400);

  const limit = await checkRateLimitAsync(`admin-url-reveal:${auth.session.sub}`, REVEALS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);

  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return noStore({ error: "database_required" }, 503);
  }

  const { urlId } = await context.params;
  const link = await db.submittedUrl.findUnique({
    where: { id: urlId },
    select: { id: true, urlEncrypted: true, submittedAt: true },
  });
  if (!link) return noStore({ error: "url_not_found" }, 404);
  // Links are deleted after the retention period; nothing to show.
  if (!link.urlEncrypted || isUrlExpired(link.submittedAt)) return noStore({ error: "url_expired" }, 410);

  // Recorded before the link is returned: no reveal without a record.
  try {
    await recordAdminAccess(
      { adminId: auth.session.sub, action: "url_revealed", entityType: "SubmittedUrl", entityId: link.id, reason: parsed.data.reason },
      request.headers,
      { required: true },
    );
  } catch {
    return noStore({ error: "access_log_failed" }, 503);
  }
  await writeAuditLog({
    eventType: "URL_REVEALED",
    entityType: "SubmittedUrl",
    entityId: link.id,
    actorId: auth.session.sub,
    data: { reason: parsed.data.reason },
  });

  return noStore({ url: decryptField(link.urlEncrypted) });
}
