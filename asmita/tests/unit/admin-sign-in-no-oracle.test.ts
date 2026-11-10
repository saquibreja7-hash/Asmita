import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limitCalls: string[] = [];
const blocked = new Set<string>();
const sendOtp = vi.hoisted(() => vi.fn());
const createOtp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(async (key: string) => {
    limitCalls.push(key);
    const isBlocked = [...blocked].some((prefix) => key.startsWith(prefix));
    return { allowed: !isBlocked, remaining: isBlocked ? 0 : 1 };
  }),
}));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOtp }));
vi.mock("@/lib/auth/otp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/otp")>();
  createOtp.mockImplementation(actual.createOtpForEmail);
  return { ...actual, createOtpForEmail: createOtp };
});

import { POST as requestAdminOtp } from "@/app/api/admin/auth/request-otp/route";
import { POST as verifyAdmin } from "@/app/api/admin/auth/verify/route";
import { resetOtpStore } from "@/lib/auth/otp";

// Synthetic identities only.
const ADMIN_EMAIL = "oracle-admin@example.invalid";
const STRANGER_EMAIL = "oracle-stranger@example.invalid";
const ENV_NAMES = ["ADMIN_EMAILS", "ADMIN_ROLES", "DATABASE_URL", "DEV_OTP_CODE", "DEV_SKIP_ADMIN_MFA", "RESEND_API_KEY"] as const;
const original = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

function post(path: string, body: unknown) {
  return new Request(`https://asmita.test${path}`, { method: "POST", body: JSON.stringify(body) });
}
const otpRequest = (email: string) => requestAdminOtp(post("/api/admin/auth/request-otp", { email }));
const verifyRequest = (email: string, otp = "000000") =>
  verifyAdmin(post("/api/admin/auth/verify", { email, otp, totp: "000000" }));

describe("admin sign-in does not reveal which emails are admins", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DEV_OTP_CODE;
    delete process.env.DEV_SKIP_ADMIN_MFA;
    // As configured when email is live: the dev-only devOtp field is absent.
    process.env.RESEND_API_KEY = "re_synthetic_not_a_key";
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    process.env.ADMIN_ROLES = `${ADMIN_EMAIL}=SUPER_ADMIN`;
    limitCalls.length = 0;
    blocked.clear();
    sendOtp.mockReset();
    createOtp.mockClear();
    resetOtpStore();
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });

  it("request-otp gives an admin and a non-admin the same status and body", async () => {
    const admin = await otpRequest(ADMIN_EMAIL);
    const stranger = await otpRequest(STRANGER_EMAIL);
    expect(stranger.status).toBe(admin.status);
    expect(admin.status).toBe(200);
    expect(await stranger.json()).toEqual(await admin.json());
  });

  it("request-otp stores and emails a code only for an admin", async () => {
    await otpRequest(STRANGER_EMAIL);
    expect(createOtp).not.toHaveBeenCalled();
    expect(sendOtp).not.toHaveBeenCalled();
    await otpRequest(ADMIN_EMAIL);
    expect(createOtp).toHaveBeenCalledTimes(1);
    expect(sendOtp).toHaveBeenCalledTimes(1);
    expect(sendOtp.mock.calls[0][0]).toBe(ADMIN_EMAIL);
  });

  it("request-otp applies the same limiters to a non-admin and cuts both off the same way", async () => {
    await otpRequest(ADMIN_EMAIL);
    const adminKeys = limitCalls.map((key) => key.split(":")[0]);
    limitCalls.length = 0;
    await otpRequest(STRANGER_EMAIL);
    expect(limitCalls.map((key) => key.split(":")[0])).toEqual(adminKeys);

    blocked.add("admin-otp:");
    const admin = await otpRequest(ADMIN_EMAIL);
    const stranger = await otpRequest(STRANGER_EMAIL);
    expect(admin.status).toBe(429);
    expect(stranger.status).toBe(429);
    expect(await stranger.json()).toEqual(await admin.json());
  });

  it("request-otp gives the same 400 to a malformed address whoever it is", async () => {
    const response = await otpRequest("not-an-email");
    expect(response.status).toBe(400);
  });

  it("verify gives a non-admin the same error as an admin with a wrong code", async () => {
    await otpRequest(ADMIN_EMAIL);
    const wrongCode = await verifyRequest(ADMIN_EMAIL);
    const stranger = await verifyRequest(STRANGER_EMAIL);
    expect(wrongCode.status).toBe(401);
    expect(stranger.status).toBe(401);
    expect(await stranger.json()).toEqual(await wrongCode.json());
  });

  it("verify rate limits a non-admin like an admin", async () => {
    await verifyRequest(ADMIN_EMAIL);
    const adminKeys = limitCalls.map((key) => key.split(":")[0]);
    limitCalls.length = 0;
    await verifyRequest(STRANGER_EMAIL);
    expect(limitCalls.map((key) => key.split(":")[0])).toEqual(adminKeys);

    blocked.add("admin-verify:");
    const admin = await verifyRequest(ADMIN_EMAIL);
    const stranger = await verifyRequest(STRANGER_EMAIL);
    expect(admin.status).toBe(429);
    expect(stranger.status).toBe(429);
  });

  it("never returns a code for anyone when production is set, even without an email key", async () => {
    const env = process.env as Record<string, string | undefined>;
    const savedNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    delete env.RESEND_API_KEY;
    try {
      for (const email of [ADMIN_EMAIL, STRANGER_EMAIL]) {
        expect(await (await otpRequest(email)).json()).toEqual({ success: true });
      }
    } finally {
      env.NODE_ENV = savedNodeEnv;
    }
  });
});
