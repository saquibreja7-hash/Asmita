import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { sha256 } from "@/lib/hash";
import { labEnabled } from "@/lib/lab/flags";
import { runDetectorPanel } from "@/lib/lab/detectors/panel";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { getClientIp } from "@/lib/request-ip";

/*
 * The detector panel's one route (docs/lab/beta-spec.md WP90): a visitor
 * uploads one image and every configured "AI-made or manipulated" detector
 * answers with a score.
 *
 * The image is held in memory for this request only: it is never written to
 * disk, database or logs — no bytes, no filename, no hash of it — and it is
 * sent nowhere except the detector providers named in the WP (OpenAI vision,
 * Hive, Sightengine) and only to those whose keys are configured. Adapters
 * whose keys are unset answer "not configured"; the panel still renders.
 *
 * Guarded by: the Lab switch (503 lab_disabled while ENABLE_LAB is off), CSRF
 * on the POST, a declared-content-length pre-check, a per-IP rate-limit
 * bucket, the strict Zod fields below, a magic-byte sniff of the first
 * bytes, and the site-wide LAB_DETECTOR_DAILY_LIMIT cap. The daily cap is
 * spent only by a request that passed every check above it, so one source
 * cannot drain the panel's budget with rejected payloads.
 */

const ROUTE = "/api/lab/detectors";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, the beta spec's upload cap.
// Multipart overhead (boundaries, the consent field): 64 KiB is ample.
const MAX_BODY_BYTES = MAX_BYTES + 64 * 1024;

// Default 200 images per day across the whole site; override with
// LAB_DETECTOR_DAILY_LIMIT.
function dailyLimit() {
  const value = Number(process.env.LAB_DETECTOR_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : 200;
}

// Ten images per hour per IP, the same budget /api/check-image gives its
// upload route.
const IP_HOURLY_LIMIT = 10;

/** Strict payload: the only string field is the consent tick. */
const formSchema = z.object({ consent: z.literal("true") }).strict();

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

export async function POST(request: Request) {
  if (!labEnabled()) {
    return NextResponse.json({ error: "lab_disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: ROUTE });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // Reject an oversized declared body before it is read into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  const ip = getClientIp(request);
  const ipLimit = await checkRateLimitAsync(`lab-detectors-ip:${sha256(ip)}`, IP_HOURLY_LIMIT, 60 * 60_000, {
    shared: true,
  });
  if (!ipLimit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: ROUTE, reason: "ip" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const parsed = formSchema.safeParse({ consent: form.get("consent") });
  if (!parsed.success) {
    return NextResponse.json({ error: "consent_required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "no_file" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "invalid_size" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  // The declared type is client-controlled: sniff the first bytes in memory
  // so this route can never relay non-image data to a provider.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!looksLikeImage(head, file.type)) {
    await logSecurityEvent({ event: "media_payload_rejected", route: ROUTE, reason: "magic_bytes" });
    return NextResponse.json({ error: "not_an_image" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }

  // Site-wide daily budget, spent only by a request that passed every check
  // above — the same discipline OTP_GLOBAL_HOURLY_LIMIT follows.
  const daily = await checkRateLimitAsync("lab-detectors-global", dailyLimit(), 24 * 60 * 60_000);
  if (!daily.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: ROUTE, reason: "daily_cap" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  // In memory for this request only; discarded when it returns.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await runDetectorPanel({ bytes, mime: file.type });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
