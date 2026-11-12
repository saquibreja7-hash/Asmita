import { recordTier1ApiAttempt } from "@/lib/tier1-api-client";

/**
 * Platform API transport: sends a notice package to a partner platform's
 * reporting endpoint over HTTPS+JSON instead of email.
 *
 * Safety invariants, all shared with the email channel:
 *   - The payload body is the SAME rendered, legally reviewed template text the
 *     email would carry (notice integrity: what the survivor signed is what
 *     goes out). The reported URL itself is never in the payload — it lives in
 *     the signed PDF, which is included as base64, mirroring the email
 *     attachment.
 *   - Fingerprints are the exact approved, signed PDQ values (decrypted from
 *     hashEncrypted, never the sha256 dedup digest).
 *   - Idempotent per notice: the Idempotency-Key header lets the platform
 *     deduplicate, and the Notice table prevents a second dispatch locally.
 *   - Never fetches submitted URLs; the only outbound request is to the
 *     admin-configured apiEndpoint.
 */

export type PlatformApiFingerprint = {
  algorithm: "PDQ";
  digest: string;
  quality: number;
};

export type PlatformApiPayload = {
  schemaVersion: 1;
  kind: "URL_NOTICE" | "HASH_ADVISORY";
  caseReference: string;
  noticeBasis: string;
  subject: string;
  body: string;
  fingerprints: PlatformApiFingerprint[];
  /** The survivor-signed operative document, exactly as the email attaches it. */
  signedNoticePdfBase64?: string;
  idempotencyKey: string;
  sentAt: string;
};

export function platformApiEnabled() {
  return process.env.ENABLE_PLATFORM_API === "true";
}

export function platformApiTimeoutMs() {
  const raw = Number(process.env.TIER1_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : 10_000;
}

export function buildPlatformApiPayload(input: {
  kind: PlatformApiPayload["kind"];
  caseReference: string;
  noticeBasis: string;
  subject: string;
  body: string;
  fingerprints: PlatformApiFingerprint[];
  signedNoticePdf?: Buffer | null;
  idempotencyKey: string;
  now?: Date;
}): PlatformApiPayload {
  return {
    schemaVersion: 1,
    kind: input.kind,
    caseReference: input.caseReference,
    noticeBasis: input.noticeBasis,
    subject: input.subject,
    body: input.body,
    fingerprints: input.fingerprints,
    ...(input.signedNoticePdf
      ? { signedNoticePdfBase64: input.signedNoticePdf.toString("base64") }
      : {}),
    idempotencyKey: input.idempotencyKey,
    sentAt: (input.now ?? new Date()).toISOString(),
  };
}

export type PlatformApiSendResult =
  | { ok: true; status: number; referenceId?: string }
  | { ok: false; status: number | "network_error" | "timeout"; error?: string };

/**
 * POSTs the notice payload to the platform endpoint. Non-2xx responses and
 * network/timeout failures resolve to { ok: false } so callers can fall back
 * to email; this function never throws for transport problems.
 */
export async function sendNoticeToPlatformApi(input: {
  endpoint: string;
  accessToken: string;
  payload: PlatformApiPayload;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<PlatformApiSendResult> {
  const timeoutMs = input.timeoutMs ?? platformApiTimeoutMs();
  const doFetch = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(input.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        "idempotency-key": input.payload.idempotencyKey,
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    let referenceId: string | undefined;
    try {
      const parsed = (await response.json()) as { referenceId?: unknown; id?: unknown };
      if (typeof parsed?.referenceId === "string" && parsed.referenceId) {
        referenceId = parsed.referenceId;
      } else if (typeof parsed?.id === "string" && parsed.id) {
        referenceId = parsed.id;
      }
    } catch {
      // A 2xx without a JSON body is a success; the platform simply owes no
      // reference id.
    }
    return { ok: true, status: response.status, referenceId };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted
      ? { ok: false, status: "timeout" }
      : { ok: false, status: "network_error", error: err instanceof Error ? err.message : undefined };
  } finally {
    clearTimeout(timer);
  }
}

/** Records the attempt in the in-memory observability log (dev/ops aid). */
export function recordPlatformApiAttempt(input: {
  platformId: string;
  result: PlatformApiSendResult;
  fallbackReason?: string;
}) {
  return recordTier1ApiAttempt({
    platformId: input.platformId,
    status: input.result.status,
    platformReferenceId: input.result.ok ? input.result.referenceId : undefined,
    fallbackReason: input.fallbackReason,
  });
}
