import { NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  CSP_REPORT_CONTENT_TYPES,
  CSP_REPORTS_PER_10_MINUTES,
  CSP_REPORT_WINDOW_MS,
  logCspViolation,
  MAX_CSP_REPORT_BYTES,
  summarizeCspReports,
} from "@/lib/csp-report";

/*
 * CSP violation reporting endpoint (WP46 S5). Browsers POST reports here
 * without credentials and without a CSRF token, so this route authenticates
 * nothing — it only accepts the two CSP report content types, caps the body,
 * rate limits per network and logs three fields per violation. Anything that
 * is not a CSP report is refused; the payload is never stored or echoed.
 */

export const dynamic = "force-dynamic";

function empty(status: number) {
  return new NextResponse(null, { status });
}

export async function POST(request: Request) {
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(CSP_REPORT_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return empty(415);
  }
  // Throttle before reading the body, as the other public POST routes do.
  // Per network (shared bucket): many survivors sit behind one mobile IP.
  const limit = await checkRateLimitAsync(
    `csp-report-ip:${getClientIp(request)}`,
    CSP_REPORTS_PER_10_MINUTES,
    CSP_REPORT_WINDOW_MS,
    { shared: true },
  );
  if (!limit.allowed) return empty(429);

  // Size cap (8 KB): the declared length is refused up front, and the read
  // body is measured before anything is parsed — the same shape as the
  // crawler routes' caps.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_CSP_REPORT_BYTES) return empty(413);
  const body = await request.text().catch(() => "");
  if (body.length > MAX_CSP_REPORT_BYTES) return empty(413);

  const summaries = summarizeCspReports(contentType, body);
  if (summaries === null) return empty(400);

  for (const summary of summaries) logCspViolation(summary);
  return empty(204);
}
