import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { VOICE_AGENT, VOICE_AGENT_PATH } from "@/lib/helpline";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";

/*
 * Starts a browser voice session with the Sarvam helpline agent (/talk).
 *
 * The browser SDK is pointed here as its baseUrl and asks for a signed,
 * single-use WebSocket URL. We fetch that URL from Sarvam with our API key,
 * which never leaves the Worker, and hand back only the signed URL; the
 * audio then flows between the browser and Sarvam. Nothing about the
 * session (audio, transcript, caller) is stored on our side.
 */

const SARVAM_API = "https://apps.sarvam.ai/api/app-runtime/";
const ROUTE = "/api/voice";

// Default 100 voice sessions a day across the whole site, so the Sarvam
// credits cannot be drained; override with VOICE_DAILY_SESSION_LIMIT.
function voiceDailyLimit() {
  const value = Number(process.env.VOICE_DAILY_SESSION_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : 100;
}

function isSarvamSocketUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "wss:" && url.hostname.endsWith(".sarvam.ai");
  } catch {
    return false;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") !== VOICE_AGENT_PATH) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: ROUTE });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
  let globalLimit = { allowed: false, remaining: 0 };
  try {
    // Five calls an hour per IP: Sarvam credits are limited.
    ipLimit = await checkRateLimitAsync(`voice-session-ip:${getClientIp(request)}`, 5, 60 * 60_000, { shared: true });
    // Only requests within their IP limit count towards the daily cap, so one
    // source cannot use up everyone's sessions.
    if (ipLimit.allowed) {
      globalLimit = await checkRateLimitAsync("voice-session-global", voiceDailyLimit(), 24 * 60 * 60_000);
    }
  } catch (error) {
    await logSecurityEvent({
      event: "rate_limit_unavailable",
      route: ROUTE,
      reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
    });
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  if (!ipLimit.allowed || !globalLimit.allowed) {
    await logSecurityEvent({
      event: "rate_limit_exceeded",
      route: ROUTE,
      reason: ipLimit.allowed ? "voice_daily_cap" : "voice_ip",
    });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "x-retry-after": "3600" } },
    );
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "voice_unavailable" }, { status: 503 });
  }

  const query = new URLSearchParams({ interaction_type: "call", version: String(VOICE_AGENT.version) });
  let response: Response;
  try {
    response = await fetch(`${SARVAM_API}${VOICE_AGENT_PATH}?${query}`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[voice] Sarvam signed URL request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
  }
  if (!response.ok) {
    console.error(`[voice] Sarvam signed URL request returned ${response.status}`);
    return NextResponse.json(
      { error: response.status === 429 ? "rate_limited" : "voice_unavailable" },
      { status: response.status === 429 ? 429 : 502 },
    );
  }

  const data = (await response.json().catch(() => null)) as { url?: unknown; reference_id?: unknown } | null;
  if (!data || !isSarvamSocketUrl(data.url) || typeof data.reference_id !== "string") {
    console.error("[voice] Sarvam returned an unexpected signed URL response");
    return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
  }
  return NextResponse.json(
    { url: data.url, reference_id: data.reference_id },
    { headers: { "cache-control": "no-store" } },
  );
}
