import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { isAdminEmail } from "@/lib/auth/admin-allowlist";
import { resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { hashEmail } from "@/lib/hash";
import { verifyCsrfRequest } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security-log";

const schema = z.object({ email: z.email() });

/*
 * Clears another admin's authenticator enrolment so they can enrol a new
 * device. Requires users:manage (SUPER_ADMIN). The target falls back to the
 * shared bootstrap secret for their next login, then must re-enrol.
 */
export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    logSecurityEvent({ event: "csrf_failed", route: "/api/admin/mfa/reset" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("users:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isAdminEmail(parsed.data.email)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const targetHash = hashEmail(parsed.data.email);
  const removed = await resetAdminMfa(targetHash);

  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "Admin",
    entityId: `admin-${targetHash.slice(0, 24)}`,
    actorId: auth.session.sub,
    data: { action: "ADMIN_MFA_RESET", removed },
  });

  return NextResponse.json({ ok: true, removed });
}
