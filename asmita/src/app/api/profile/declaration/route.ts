import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/auth/middleware";
import { verifyCsrfRequest } from "@/lib/csrf";

const schema = z.object({
  acknowledged: z.literal(true),
  version: z.string().min(1).default("draft-2026-05-12"),
  language: z.enum(["en", "hi"]).default("en"),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const declarationLoggedAt = new Date().toISOString();
  await writeAuditLog({
    eventType: "DECLARATION_SIGNED",
    entityType: "User",
    entityId: auth.session.sub,
    actorId: auth.session.sub,
    data: {
      declarationVersion: parsed.data.version,
      language: parsed.data.language,
      declarationLoggedAt,
    },
  });

  return NextResponse.json({ declarationLoggedAt });
}
