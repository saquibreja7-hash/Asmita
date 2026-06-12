import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";

const schema = z.object({
  caseId: z.string().uuid(),
  platformIds: z.array(z.string().uuid()).min(1).max(25),
});

// Sensitive outbound action: sends hash advisory emails to platform
// compliance contacts. Admin-only, behind the Phase 2 feature flag, and the
// dispatch service enforces its own gates (legal-reviewed template, approved
// hashes only, human-verified recipients, idempotency).
export async function POST(request: Request) {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("cases:review");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  try {
    const results = await dispatchHashAdvisories({
      caseId: parsed.data.caseId,
      platformIds: parsed.data.platformIds,
      actorId: auth.session.sub,
    });
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    const status =
      msg === "case_not_found" || msg === "hash_advisory_template_missing" ? 404 : 409;
    return NextResponse.json({ error: msg }, { status });
  }
}

