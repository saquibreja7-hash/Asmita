import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { getClientIp } from "@/lib/request-ip";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { sha256 } from "@/lib/hash";
import { logSecurityEvent } from "@/lib/security-log";

// Server-side content-provenance check.
//
// WARNING: this route sends survivor images to a third party (OpenAI). ADR 002
// is still PROPOSED and blocked on legal sign-off. Never set
// ENABLE_PROVENANCE_CHECK=true in staging or production, and never widen what
// this route sends, until ADR 002 is accepted by counsel.
//
// This route forwards the image to OpenAI's content-provenance endpoint to read
// C2PA credentials and the SynthID watermark. It is a documented exception to the
// "no media on our server" rule (see docs/adr/002-consented-encrypted-media.md):
// the image is held only in memory for the duration of the request, forwarded
// over TLS, and never written to disk, database, or logs. We keep no copy.
//
// Guarded by: CSRF, IP rate limit, an adults-only confirmation, and an explicit
// consent flag acknowledging the image is sent to OpenAI. The detection result
// never gates whether a survivor receives help.

const OPENAI_URL = "https://api.openai.com/v1/content_provenance_checks";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, well under OpenAI's 50 MiB limit.

type OpenAiResult = {
  type?: string;
  outcome?: string;
  validation_state?: string;
  issuer?: string | null;
  model?: string | null;
  generated_at?: string | null;
};

export async function POST(request: Request) {
  if (process.env.ENABLE_PROVENANCE_CHECK !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/check-image" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const limit = await checkRateLimitAsync(`check-image:${sha256(ip)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/check-image" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Both gates are mandatory: adults-only, and explicit consent to send to OpenAI.
  if (form.get("ageConfirmed") !== "true") {
    await logSecurityEvent({ event: "minor_route_blocked", route: "/api/check-image", reason: "age_not_confirmed" });
    return NextResponse.json({ error: "age_not_confirmed" }, { status: 400 });
  }
  if (form.get("consent") !== "true") {
    return NextResponse.json({ error: "consent_required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "invalid_size" }, { status: 413 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "provider_unconfigured" }, { status: 503 });
  }

  // Forward in memory. Nothing is written down on our side.
  const upstream = new FormData();
  upstream.append("file", file, "image");

  let openaiResponse: Response;
  try {
    openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json({ error: "provider_unreachable" }, { status: 502 });
  }

  if (!openaiResponse.ok) {
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }

  const payload = (await openaiResponse.json()) as { results?: OpenAiResult[] };
  const results = payload.results ?? [];

  const checks = results.map((r) => ({
    type: r.type ?? "unknown",
    detected: r.outcome === "detected",
    validationState: r.validation_state ?? null,
    issuer: r.issuer ?? null,
    model: r.model ?? null,
    generatedAt: r.generated_at ?? null,
  }));

  // "Detected" here means a real signal (a credential or watermark), not a guess.
  const detected = checks.some((c) => c.detected);

  return NextResponse.json({ detected, checks });
}
