import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { getClientIp } from "@/lib/request-ip";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { sha256 } from "@/lib/hash";
import { logSecurityEvent } from "@/lib/security-log";
import { provenanceCheckEnabled } from "@/lib/dev-flags";

// Server-side content-provenance check.
//
// This route sends the image she chose to a third party (OpenAI's
// POST /v1/content_provenance_checks). The owner accepted exactly this one
// route on 19 November 2026 (see the "Decision recorded" note in
// docs/adr/002-consented-encrypted-media.md); the evidence-vault part of
// ADR 002 stays blocked. It runs only when ENABLE_PROVENANCE_CHECK=true
// (set in the production Worker vars), and every call requires the
// adults-only gate and an explicit per-check consent tick, both enforced
// here on the server. The result never gates whether a survivor receives help.
//
// What may leave this server is exactly the image she consented to send:
// the image is held only in memory for the duration of the request, forwarded
// over TLS to OpenAI, and never written to disk, database, or logs — no
// bytes, no filename, no hash of the image is stored or logged by us. The
// only network call is the one to OpenAI; the OpenAI response is reduced to
// the fields the page shows. OPENAI_API_KEY is a Worker secret, never in
// code or vars; without it the route answers "not configured" (503).
//
// Guarded by: CSRF, a per-IP Postgres rate-limit bucket (shared, with the
// in-memory fallback every route uses), the content-length pre-check below,
// a strict image-type allowlist plus a magic-byte sniff of the first bytes,
// and the 20 MB size cap.

const OPENAI_URL = "https://api.openai.com/v1/content_provenance_checks";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, well under OpenAI's 50 MiB limit.
// Multipart overhead (boundaries, the two small fields): 64 KiB is ample.
const MAX_BODY_BYTES = MAX_BYTES + 64 * 1024;

/**
 * Magic bytes of the three allowed image types. The declared MIME type is
 * client-controlled, so the bytes are sniffed before anything is relayed.
 */
function looksLikeImage(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    );
  }
  // WebP: RIFF....WEBP
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}

type OpenAiResult = {
  type?: string;
  outcome?: string;
  validation_state?: string;
  issuer?: string | null;
  model?: string | null;
  generated_at?: string | null;
};

export async function POST(request: Request) {
  if (!provenanceCheckEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/check-image" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  // Reject an oversized declared body before it is read into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const ip = getClientIp(request);
  const limit = await checkRateLimitAsync(`check-image:${sha256(ip)}`, 10, 60 * 60 * 1000, { shared: true });
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

  // The declared type is client-controlled: sniff the first bytes in memory
  // so this route can never be used to relay non-image data to OpenAI.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!looksLikeImage(head, file.type)) {
    await logSecurityEvent({ event: "media_payload_rejected", route: "/api/check-image", reason: "magic_bytes" });
    return NextResponse.json({ error: "not_an_image" }, { status: 415 });
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

  const payload = (await openaiResponse.json().catch(() => null)) as { results?: OpenAiResult[] } | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
  const results = payload.results ?? [];

  // Reduced to exactly the fields the page shows; nothing else of the
  // provider's response is passed through.
  const checks = results.map((r) => ({
    type: typeof r.type === "string" ? r.type : "unknown",
    detected: r.outcome === "detected",
    validationState: typeof r.validation_state === "string" ? r.validation_state : null,
    model: typeof r.model === "string" ? r.model : null,
  }));

  // "Detected" here means a real signal (a credential or watermark), not a guess.
  const detected = checks.some((c) => c.detected);

  return NextResponse.json({ detected, checks });
}
