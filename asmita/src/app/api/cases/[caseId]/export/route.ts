import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/middleware";
import { writeAuditLog } from "@/lib/audit";
import { generateFirPackagePdf } from "@/lib/fir-package-generator";
import { getCaseForUser } from "@/lib/case-ops";

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { caseId } = await context.params;
  const record = await getCaseForUser(caseId, auth.session.sub);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await generateFirPackagePdf({
    referenceNumber: record.referenceNumber,
    createdAt: record.createdAt,
    language: "en",
    urls: record.urls.map((url) => ({
      domain: url.domain,
      platformName: url.platformName,
      status: url.status,
    })),
  });

  await writeAuditLog({
    eventType: "CASE_EXPORT",
    entityType: "Case",
    entityId: record.id,
    actorId: auth.session.sub,
  });

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${record.referenceNumber}.pdf"`,
    },
  });
}
