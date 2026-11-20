import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { newsletterCounts } from "@/lib/org-newsletter";

// Newsletter admin (docs/org/spec.md, 56.7): counts by status. Sending
// newsletters is out of scope — they go out from an external tool for now —
// so the admin page says so. The CSV export of confirmed subscribers is a
// separate GET (../export), audit-logged in the store.

export async function GET() {
  const auth = await requireAdminPermission("outreach:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const counts = await newsletterCounts();
  return NextResponse.json({ counts }, { headers: { "Cache-Control": "no-store" } });
}
