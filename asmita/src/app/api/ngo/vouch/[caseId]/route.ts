import { NextResponse } from "next/server";
import { vouchCase } from "@/lib/case-ops";
import { verifyNgoApiKey } from "@/lib/ngo-api-keys";
import {
  getCachedResponse,
  readIdempotencyKey,
  rememberResponse,
} from "@/lib/idempotency";

const SCOPE = "ngo:vouch";

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
  const idemKey = readIdempotencyKey(request);
  const idemActor = `${partner.id}:${caseId}`;
  if (idemKey) {
    const cached = getCachedResponse(SCOPE, idemActor, idemKey);
    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
  }

  try {
    await vouchCase(caseId, partner.partnerName, partner.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  const body = {
    success: true,
    caseId,
    partnerName: partner.partnerName,
  };
  if (idemKey) {
    rememberResponse(SCOPE, idemActor, idemKey, 200, body);
  }
  return NextResponse.json(body);
}
