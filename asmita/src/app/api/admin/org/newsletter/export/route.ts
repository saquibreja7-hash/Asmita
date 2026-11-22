import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { exportNewsletterCsv } from "@/lib/org-newsletter";

// CSV export of confirmed subscribers (email, locale, confirmed date),
// audit-logged in the store. outreach:manage.

export async function GET() {
  const auth = await requireAdminPermission("outreach:manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const csv = await exportNewsletterCsv(auth.session.sub);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="newsletter-subscribers.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
