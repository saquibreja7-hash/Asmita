/**
 * Mocked-Prisma route-handler tests.
 * No real DB, Redis, or email — all external deps are vi.mock'd.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCsrfPair } from "@/lib/csrf";

vi.mock("@/lib/auth/middleware");
vi.mock("@/lib/case-ops");
vi.mock("@/lib/email");
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit");
vi.mock("@/lib/abuse-detection");
vi.mock("@/lib/auth/otp");
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn(), securityEvents: [] }));

import * as middleware from "@/lib/auth/middleware";
import * as caseOps from "@/lib/case-ops";
import * as emailLib from "@/lib/email";
import * as rateLimit from "@/lib/rate-limit";
import * as abuse from "@/lib/abuse-detection";
import * as otpLib from "@/lib/auth/otp";

import { POST as requestOtpRoute } from "@/app/api/auth/request-otp/route";
import { POST as verifyOtpRoute } from "@/app/api/auth/verify-otp/route";
import { POST as createCaseRoute } from "@/app/api/cases/create/route";
import { GET as getCaseRoute } from "@/app/api/cases/[caseId]/route";
import { POST as addUrlsRoute } from "@/app/api/cases/[caseId]/urls/route";
import { POST as markResolvedRoute } from "@/app/api/cases/[caseId]/mark-resolved/route";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function csrfPost(path: string, body: unknown): Request {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `asmita_csrf=${nonce}`,
      "x-csrf-token": token,
    },
    body: JSON.stringify(body),
  });
}

function noCsrfPost(path: string, body: unknown = {}): Request {
  return new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const authed = {
  ok: true as const,
  session: {
    sub: "user-1",
    role: "VICTIM" as const,
    ageOver18: true,
    emailHash: "hash-1",
    namespace: "victim" as const,
    adminRole: undefined,
  },
};
const unauthed = { ok: false as const, status: 401 as const, error: "unauthorized" };

const fakeCase = {
  id: "case-1",
  referenceNumber: "ASMITA-2026-00001",
  userId: "user-1",
  createdAt: new Date().toISOString(),
  status: "OPEN",
  urls: [],
};

const allowed = { allowed: true, remaining: 9 };
const blocked = { allowed: false, remaining: 0 };

afterEach(() => vi.clearAllMocks());

// ─── POST /api/auth/request-otp ─────────────────────────────────────────────

describe("POST /api/auth/request-otp", () => {
  beforeEach(() => {
    vi.mocked(rateLimit.checkRateLimitAsync).mockResolvedValue(allowed);
    vi.mocked(otpLib.createOtpForEmail).mockResolvedValue({ token: "123456" } as never);
    vi.mocked(emailLib.sendOtp).mockResolvedValue(undefined as never);
  });

  it("returns 403 when CSRF headers are absent", async () => {
    const res = await requestOtpRoute(
      noCsrfPost("/api/auth/request-otp", { email: "victim@example.com" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "csrf_failed" });
  });

  it("returns 400 for an invalid email address", async () => {
    const res = await requestOtpRoute(
      csrfPost("/api/auth/request-otp", { email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_email" });
  });

  it("returns 429 when any rate limit bucket is exhausted", async () => {
    vi.mocked(rateLimit.checkRateLimitAsync).mockResolvedValue(blocked);
    const res = await requestOtpRoute(
      csrfPost("/api/auth/request-otp", { email: "victim@example.com" }),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
  });

  it("returns 502 when the email provider rejects the send", async () => {
    vi.mocked(emailLib.sendOtp).mockRejectedValue(new Error("Resend 5xx"));
    const res = await requestOtpRoute(
      csrfPost("/api/auth/request-otp", { email: "victim@example.com" }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "email_failed" });
  });

  it("returns 200 and success:true on the happy path", async () => {
    const res = await requestOtpRoute(
      csrfPost("/api/auth/request-otp", { email: "victim@example.com" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });
});

// ─── POST /api/auth/verify-otp ──────────────────────────────────────────────

describe("POST /api/auth/verify-otp", () => {
  beforeEach(() => {
    vi.mocked(otpLib.verifyOtp).mockResolvedValue(true);
    vi.mocked(caseOps.upsertVerifiedUser).mockResolvedValue({ id: "user-1", emailHash: "hash-1" });
  });

  it("returns 403 on missing CSRF", async () => {
    const res = await verifyOtpRoute(
      noCsrfPost("/api/auth/verify-otp", { email: "v@example.com", otp: "123456", ageOver18: true }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when payload is malformed", async () => {
    const res = await verifyOtpRoute(
      csrfPost("/api/auth/verify-otp", { email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_payload" });
  });

  it("returns 401 when OTP is wrong", async () => {
    vi.mocked(otpLib.verifyOtp).mockResolvedValue(false);
    const res = await verifyOtpRoute(
      csrfPost("/api/auth/verify-otp", { email: "v@example.com", otp: "000000", ageOver18: true }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid_otp" });
  });

  it("redirects under-18 users without creating a DB record", async () => {
    const res = await verifyOtpRoute(
      csrfPost("/api/auth/verify-otp", { email: "v@example.com", otp: "123456", ageOver18: false }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ redirectTo: "/minor-support" });
    expect(caseOps.upsertVerifiedUser).not.toHaveBeenCalled();
  });

  it("sets asmita_session cookie and returns /submit redirect on success", async () => {
    const res = await verifyOtpRoute(
      csrfPost("/api/auth/verify-otp", { email: "v@example.com", otp: "123456", ageOver18: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, redirectTo: "/submit" });
    expect(res.headers.get("set-cookie")).toContain("asmita_session=");
  });
});

// ─── POST /api/cases/create ─────────────────────────────────────────────────

describe("POST /api/cases/create", () => {
  beforeEach(() => {
    vi.mocked(middleware.requireSession).mockResolvedValue(authed);
    vi.mocked(caseOps.createCase).mockResolvedValue({ id: "case-1", referenceNumber: "ASMITA-2026-00001" });
    vi.mocked(caseOps.getVerifiedUserEmail).mockResolvedValue("victim@example.com");
    vi.mocked(emailLib.sendVictimConfirmation).mockResolvedValue(undefined as never);
  });

  it("returns 403 on missing CSRF", async () => {
    const res = await createCaseRoute(noCsrfPost("/api/cases/create"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when the session is missing", async () => {
    vi.mocked(middleware.requireSession).mockResolvedValue(unauthed);
    const res = await createCaseRoute(csrfPost("/api/cases/create", {}));
    expect(res.status).toBe(401);
  });

  it("returns caseId and referenceNumber on success", async () => {
    const res = await createCaseRoute(csrfPost("/api/cases/create", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      caseId: "case-1",
      referenceNumber: "ASMITA-2026-00001",
    });
  });

  it("still returns 200 when confirmation email fails (non-fatal)", async () => {
    vi.mocked(emailLib.sendVictimConfirmation).mockRejectedValue(new Error("SMTP timeout"));
    const res = await createCaseRoute(csrfPost("/api/cases/create", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ caseId: "case-1" });
  });
});

// ─── GET /api/cases/[caseId] ─────────────────────────────────────────────────

describe("GET /api/cases/[caseId]", () => {
  const ctx = { params: Promise.resolve({ caseId: "case-1" }) };

  beforeEach(() => {
    vi.mocked(middleware.requireSession).mockResolvedValue(authed);
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(middleware.requireSession).mockResolvedValue(unauthed);
    const res = await getCaseRoute(new Request("https://asmita.test/api/cases/case-1"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the case belongs to a different user (IDOR check)", async () => {
    vi.mocked(caseOps.getCaseForUser).mockResolvedValue(null);
    const res = await getCaseRoute(new Request("https://asmita.test/api/cases/case-1"), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it("returns full case data for the correct owner", async () => {
    vi.mocked(caseOps.getCaseForUser).mockResolvedValue(fakeCase);
    const res = await getCaseRoute(new Request("https://asmita.test/api/cases/case-1"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "case-1", referenceNumber: "ASMITA-2026-00001" });
  });
});

// ─── POST /api/cases/[caseId]/urls ──────────────────────────────────────────

describe("POST /api/cases/[caseId]/urls", () => {
  const ctx = { params: Promise.resolve({ caseId: "case-1" }) };
  const validBody = { urls: ["https://example.com/leaked-content"], declaration: true };

  beforeEach(() => {
    vi.mocked(middleware.requireSession).mockResolvedValue(authed);
    vi.mocked(caseOps.getCaseForUser).mockResolvedValue(fakeCase);
    vi.mocked(rateLimit.checkRateLimitAsync).mockResolvedValue(allowed);
    vi.mocked(abuse.checkUrlSubmission).mockReturnValue({ flagged: false, reasons: [] });
    vi.mocked(caseOps.addUrlsToCase).mockResolvedValue([
      {
        ok: true,
        duplicate: false,
        url: { id: "url-1", domain: "example.com", platformName: "Unknown", status: "NOTICE_QUEUED", urlHash: "abc", platformId: null },
      },
    ]);
  });

  it("returns 403 on missing CSRF", async () => {
    const res = await addUrlsRoute(noCsrfPost("/api/cases/case-1/urls", validBody), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(middleware.requireSession).mockResolvedValue(unauthed);
    const res = await addUrlsRoute(csrfPost("/api/cases/case-1/urls", validBody), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when case is not owned by the caller (prevents IDOR)", async () => {
    vi.mocked(caseOps.getCaseForUser).mockResolvedValue(null);
    const res = await addUrlsRoute(csrfPost("/api/cases/case-1/urls", validBody), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it("returns 400 when declaration is missing", async () => {
    const res = await addUrlsRoute(
      csrfPost("/api/cases/case-1/urls", { urls: ["https://example.com/x"] }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when urls array is empty", async () => {
    const res = await addUrlsRoute(
      csrfPost("/api/cases/case-1/urls", { urls: [], declaration: true }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit is exhausted", async () => {
    vi.mocked(rateLimit.checkRateLimitAsync).mockResolvedValue(blocked);
    const res = await addUrlsRoute(csrfPost("/api/cases/case-1/urls", validBody), ctx);
    expect(res.status).toBe(429);
  });

  it("returns results and flaggedForReview:false on clean submission", async () => {
    const res = await addUrlsRoute(csrfPost("/api/cases/case-1/urls", validBody), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ flaggedForReview: false, results: expect.any(Array) });
  });

  it("returns flaggedForReview:true when abuse detection fires", async () => {
    vi.mocked(abuse.checkUrlSubmission).mockReturnValue({ flagged: true, reasons: ["too_many_urls"] });
    const res = await addUrlsRoute(csrfPost("/api/cases/case-1/urls", validBody), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ flaggedForReview: true, flagReasons: ["too_many_urls"] });
  });
});

// ─── POST /api/cases/[caseId]/mark-resolved ─────────────────────────────────

describe("POST /api/cases/[caseId]/mark-resolved", () => {
  const ctx = { params: Promise.resolve({ caseId: "case-1" }) };

  beforeEach(() => {
    vi.mocked(middleware.requireSession).mockResolvedValue(authed);
    vi.mocked(caseOps.markUrlResolved).mockResolvedValue(undefined);
  });

  it("returns 403 on missing CSRF", async () => {
    const res = await markResolvedRoute(
      noCsrfPost("/api/cases/case-1/mark-resolved", { urlId: "url-1" }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(middleware.requireSession).mockResolvedValue(unauthed);
    const res = await markResolvedRoute(csrfPost("/api/cases/case-1/mark-resolved", { urlId: "url-1" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 with the error key when case_not_found is thrown", async () => {
    vi.mocked(caseOps.markUrlResolved).mockRejectedValue(new Error("case_not_found"));
    const res = await markResolvedRoute(csrfPost("/api/cases/case-1/mark-resolved", { urlId: "url-1" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "case_not_found" });
  });

  it("returns 404 with url_not_found key when URL is missing", async () => {
    vi.mocked(caseOps.markUrlResolved).mockRejectedValue(new Error("url_not_found"));
    const res = await markResolvedRoute(csrfPost("/api/cases/case-1/mark-resolved", { urlId: "url-1" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "url_not_found" });
  });

  it("returns 200 on success", async () => {
    const res = await markResolvedRoute(
      csrfPost("/api/cases/case-1/mark-resolved", { urlId: "url-1" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });
});
