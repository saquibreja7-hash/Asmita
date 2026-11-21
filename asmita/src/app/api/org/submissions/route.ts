import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { hashEmail } from "@/lib/hash";
import { sendOrgAcknowledgement, sendOrgInboxNotification } from "@/lib/email";
import { ORG_FORMS, ORG_SUBMISSION_KINDS, recordOrgSubmission } from "@/lib/org-submissions";

/*
 * The one shared public-forms endpoint (docs/org/spec.md, section 0 and
 * 56.2). Each form kind declares its Zod schema in the registry
 * (src/lib/org-submissions.ts); this route only runs the shared security:
 * CSRF, a body cap, per-network and per-email rate limits, and the hidden
 * honeypot field. Personal fields are encrypted by the store.
 */

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PER_IP_PER_HOUR = 10;
const MAX_PER_EMAIL_PER_DAY = 3;

const kindSchema = z.object({ kind: z.enum(ORG_SUBMISSION_KINDS) }).passthrough();

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/org/submissions" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const limit = await checkRateLimitAsync(`org-submissions-ip:${getClientIp(request)}`, MAX_PER_IP_PER_HOUR, 60 * 60_000, {
    shared: true,
  });
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/org/submissions" });
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
  const kindParsed = kindSchema.safeParse(body);
  if (!kindParsed.success) {
    return NextResponse.json({ error: "invalid_payload", field: "kind" }, { status: 400 });
  }
  const kind = kindParsed.data.kind;
  // The per-kind schemas are strict; the routing key itself is not a form field.
  const { kind: _routingKind, ...formBody } = body as Record<string, unknown>;
  void _routingKind;
  const parsed = ORG_FORMS[kind].schema.safeParse(formBody);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid_payload", field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }
  const fields = parsed.data as Record<string, unknown>;

  // A bot filled the hidden field: answer as if it worked, store nothing.
  if (fields.fax) return NextResponse.json({ ok: true });

  const emailHash = hashEmail(String(fields.email ?? ""));
  const perEmail = await checkRateLimitAsync(`org-submissions-email:${emailHash}`, MAX_PER_EMAIL_PER_DAY, 24 * 60 * 60_000);
  if (!perEmail.allowed) {
    return NextResponse.json({ error: "already_received" }, { status: 429 });
  }

  const { fax, ...rest } = fields;
  void fax;
  const saved = await recordOrgSubmission(kind, rest);

  // Notify the organization inbox and thank the applicant. The submission
  // is stored even if an email fails; the person can always resubmit.
  const form = ORG_FORMS[kind];
  try {
    const rows = form.detailRows(rest);
    const lines = rows.map((row) => `${row.label}: ${row.value}`);
    await sendOrgInboxNotification(form.inboxSubject(rest), [`Kind: ${kind}`, ...lines].join("\n"));
    await sendOrgAcknowledgement(String(rest.email ?? ""), form.ackSubject, form.ackLines);
  } catch (err) {
    console.error("[org-submissions] notification email failed:", err);
    await logSecurityEvent({ event: "email_failed", route: "/api/org/submissions", reason: `kind:${kind}:${saved.id}` });
  }

  return NextResponse.json({ ok: true });
}
