import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";
import { labEnabled } from "@/lib/lab/flags";
import { stampDailyLimit, stampSigningConfig } from "@/lib/lab/stamp/signing-config";
import { STAMP_IMAGE_TYPES, stampDownloadName, stampImage, type StampImageType } from "@/lib/lab/stamp/stamp";

/*
 * WP94 (docs/lab/beta-spec.md): the public stamp API, /api/lab/stamp.
 * A visitor uploads their own photo (JPEG, PNG or WebP, at most 10 MB,
 * checked by magic bytes, not by the declared name); the image is stamped
 * with C2PA Content Credentials in memory for this one request and returned
 * for download. Nothing is stored or logged — no image byte, file name or
 * typed creator name ever reaches a console line, an audit entry or a
 * counter key — and the image goes nowhere except back to the visitor.
 *
 * Gate: 503 lab_disabled while the Lab is off (on in dev and test).
 * Without a signing pair in the environment the page offers nothing and
 * this route refuses with signing_not_configured.
 */

const ROUTE = "/api/lab/stamp";

// One photo at most 10 MB, plus the multipart envelope for the file and a
// creator name of at most 100 characters. Anything bigger is refused before
// the body is read.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
const STAMPS_PER_IP_PER_HOUR = 10;
const MAX_CREATOR_CHARS = 100;

const creatorSchema = z.string().trim().max(MAX_CREATOR_CHARS);

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The image type from the file's own magic bytes, never from its label. */
function detectImageType(bytes: Uint8Array): StampImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(request: Request) {
  if (!labEnabled()) return noStore({ error: "lab_disabled" }, 503);
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: ROUTE });
    return noStore({ error: "csrf_failed" }, 403);
  }

  // Cap the body before reading it, the same two steps as the other lab
  // routes: the declared length first, then the multipart parse itself.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return noStore({ error: "payload_too_large" }, 413);

  // A stamp a minute is generous for a person, and stops a scraper: the
  // per-IP bucket is shared (the E2E bypass lifts it), the site-wide daily
  // cap is not. Both count stamps, so one source cannot spend everyone's.
  let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
  let dailyLimit = { allowed: false, remaining: 0 };
  try {
    ipLimit = await checkRateLimitAsync(`lab-stamp-ip:${getClientIp(request)}`, STAMPS_PER_IP_PER_HOUR, 60 * 60_000, { shared: true });
    if (ipLimit.allowed) {
      dailyLimit = await checkRateLimitAsync("lab-stamp-global", stampDailyLimit(), 24 * 60 * 60_000);
    }
  } catch (error) {
    await logSecurityEvent({
      event: "rate_limit_unavailable",
      route: ROUTE,
      reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
    });
    return noStore({ error: "service_unavailable" }, 503);
  }
  if (!ipLimit.allowed || !dailyLimit.allowed) {
    await logSecurityEvent({
      event: "rate_limit_exceeded",
      route: ROUTE,
      reason: ipLimit.allowed ? "stamp_daily_cap" : "stamp_ip",
    });
    return noStore({ error: "rate_limited" }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return noStore({ error: "invalid_payload" }, 400);
  }

  // Strict multipart payload: one file part named "image" and at most one
  // text part named "creator" — nothing else.
  const partNames = [...form.keys()];
  if (partNames.some((name) => name !== "image" && name !== "creator") || form.getAll("image").length !== 1) {
    return noStore({ error: "invalid_payload" }, 400);
  }
  const file = form.get("image");
  if (!(file instanceof File)) return noStore({ error: "invalid_payload" }, 400);

  const rawCreator = form.get("creator");
  const parsedCreator = creatorSchema.safeParse(typeof rawCreator === "string" ? rawCreator : "");
  if (!parsedCreator.success) return noStore({ error: "invalid_payload" }, 400);
  const creatorName = parsedCreator.data.length > 0 ? parsedCreator.data : undefined;

  // The image itself: size and type from the bytes we actually read.
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return noStore({ error: "invalid_payload" }, 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) return noStore({ error: "payload_too_large" }, 413);
  const type = detectImageType(bytes);
  if (!type || !STAMP_IMAGE_TYPES.includes(type)) {
    return noStore({ error: "invalid_payload" }, 400);
  }

  if (!stampSigningConfig()) {
    return noStore({ error: "signing_not_configured" }, 503);
  }

  try {
    const stamped = await stampImage(new URL(request.url).origin, { bytes, type, creatorName });
    return new Response(stamped.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": type,
        // An invented name: the visitor's own file name never comes back.
        "content-disposition": `attachment; filename="${stampDownloadName(type)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "signing_not_configured") return noStore({ error: "signing_not_configured" }, 503);
    if (code === "engine_unavailable") return noStore({ error: "service_unavailable" }, 503);
    // An engine failure is operational, not a security event: the engine's
    // own error text (never the image) is on the console from the lib, and
    // the visitor sees an honest retry message.
    return noStore({ error: "stamp_failed" }, 500);
  }
}
