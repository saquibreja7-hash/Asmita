import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createSavedView, listSavedViews } from "@/lib/admin-saved-views";

const schema = z
  .object({
    name: z.string().trim().min(1).max(60),
    query: z.string().max(1000),
  })
  .strict();

export async function GET() {
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ views: await listSavedViews(auth.session.emailHash) });
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const result = await createSavedView(auth.session.emailHash, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ view: result.view }, { status: 201 });
}
