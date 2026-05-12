import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { cases } from "@/lib/store";
import { verifyNgoApiKey } from "@/lib/ngo-api-keys";

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const apiKey = readBearerToken(request);
  const partner = apiKey ? verifyNgoApiKey(apiKey) : null;
  if (!partner) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  const { caseId } = await context.params;
  const record = cases.get(caseId);
  if (!record) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  record.urls.forEach((url) => {
    if (url.status === "PENDING_REVIEW") {
      url.status = "NOTICE_QUEUED";
      url.flaggedForReview = false;
      url.flagReason = `ngo_vouched:${partner.partnerName}`;
    }
  });

  await writeAuditLog({
    eventType: "NGO_VERIFIED",
    entityType: "Case",
    entityId: record.id,
    data: { partnerId: partner.id, partnerName: partner.partnerName },
  });

  return NextResponse.json({ success: true, caseId: record.id, partnerName: partner.partnerName });
}
