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
  // Her data export is her right of access: it lists every link on her case,
  // including the ones Asmita's search found, whatever the case page shows
  // (CRAWLER_SHOW_FINDINGS_TO_SURVIVOR). Found links are labelled as such.
  const record = await getCaseForUser(caseId, auth.session.sub, { includeFindings: true });
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let pdf: Awaited<ReturnType<typeof generateFirPackagePdf>>;
  try {
    pdf = await generateFirPackagePdf({
      referenceNumber: record.referenceNumber,
      createdAt: record.createdAt,
      language: "en",
      urls: record.urls.map((url) => ({
        domain: url.domain,
        platformName: url.platformName,
        status: url.status,
        sentAt: url.noticeSentAt ?? url.representativeNoticeSentAt ?? url.platformFiledAt ?? null,
        foundByAsmita: url.source === "CRAWLER",
      })),
    });
  } catch (err) {
    // The error name only: a message could carry a piece of the case.
    console.error("Case export PDF could not be built", { error: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "export_failed" }, { status: 409 });
  }

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
