import { NextResponse, type NextRequest } from "next/server";
import { crossSiteApiRequestRefusal } from "@/lib/fetch-metadata";

// Fetch Metadata guard (web audit S13), ahead of every /api route. The same
// check also runs in the Worker entry (src/cloudflare-worker.ts) so
// production never depends on this file being invoked first. This file sets
// no headers and never rewrites: the CSP still comes only from next.config.ts
// and the Worker entry (src/lib/csp.ts).
export function proxy(request: NextRequest) {
  const refusal = crossSiteApiRequestRefusal(request);
  return refusal
    ? new NextResponse(refusal.body, { status: refusal.status, headers: refusal.headers })
    : NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
