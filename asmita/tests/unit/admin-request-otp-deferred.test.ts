import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scheduled: Array<() => Promise<void>> = [];
let afterThrows = false;
const sendOtp = vi.fn();
const createOtpForEmail = vi.fn();
const logSecurityEvent = vi.fn();

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => {
    if (afterThrows) throw new Error("no request scope");
    scheduled.push(task);
  },
}));
vi.mock("@/lib/email", () => ({ sendOtp: (...args: unknown[]) => sendOtp(...args) }));
vi.mock("@/lib/auth/otp", () => ({ createOtpForEmail: (...args: unknown[]) => createOtpForEmail(...args) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/admin-allowlist", () => ({
  resolveAdminRole: (email: string) => (email === "admin@example.invalid" ? { ok: true, role: "SUPER_ADMIN" } : { ok: false, reason: "not_allowlisted" }),
}));

import { POST } from "@/app/api/admin/auth/request-otp/route";

const post = (email: string) =>
  POST(new Request("https://asmita.test/api/admin/auth/request-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  }));

const loggedEvent = (name: string) => logSecurityEvent.mock.calls.map((c) => c[0]).find((e) => e.event === name);

describe("admin request-otp: code stored inline, email deferred", () => {
  const env = { ...process.env };
  beforeEach(() => {
    scheduled.length = 0;
    afterThrows = false;
    vi.clearAllMocks();
    createOtpForEmail.mockResolvedValue({ token: "123456" });
    sendOtp.mockResolvedValue({ id: "x" });
    process.env.RESEND_API_KEY = "re_test_placeholder";
    delete process.env.DEV_OTP_CODE;
  });
  afterEach(() => { process.env = { ...env }; });

  it("answers an admin and a stranger identically; stores before the reply, sends only when deferred work runs", async () => {
    const stranger = await post("someone@example.invalid");
    const admin = await post("admin@example.invalid");
    expect(admin.status).toBe(stranger.status);
    expect(await admin.json()).toEqual(await stranger.json());
    // The code exists when the reply is returned; the email has not gone yet.
    expect(createOtpForEmail).toHaveBeenCalledTimes(1);
    expect(createOtpForEmail).toHaveBeenCalledWith("admin@example.invalid");
    expect(sendOtp).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(sendOtp).toHaveBeenCalledWith("admin@example.invalid", "123456");
  });

  it("answers 200 when the code cannot be stored, logs the hash only, and schedules no email", async () => {
    createOtpForEmail.mockRejectedValue(new Error("db down"));
    const response = await post("admin@example.invalid");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(scheduled).toHaveLength(0);
    expect(sendOtp).not.toHaveBeenCalled();
    const failure = loggedEvent("otp_persistence_failed");
    expect(failure).toMatchObject({ route: "/api/admin/auth/request-otp", reason: "db down" });
    expect(failure.actorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(failure)).not.toContain("admin@example.invalid");
  });

  it("answers 200 when the deferred email send fails, and logs the hash only", async () => {
    sendOtp.mockRejectedValue(new Error("resend down"));
    const response = await post("admin@example.invalid");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    await scheduled[0]();
    const failure = loggedEvent("email_failed");
    expect(failure).toMatchObject({ route: "/api/admin/auth/request-otp", reason: "resend down" });
    expect(failure.actorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(failure)).not.toContain("admin@example.invalid");
  });

  it("sends inline and still answers 200 when after() is unavailable", async () => {
    afterThrows = true;
    sendOtp.mockRejectedValue(new Error("resend down"));
    const response = await post("admin@example.invalid");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(sendOtp).toHaveBeenCalledWith("admin@example.invalid", "123456");
    expect(scheduled).toHaveLength(0);
  });

  it("keeps the dev path inline and returns the code when no Resend key is set", async () => {
    delete process.env.RESEND_API_KEY;
    (process.env as Record<string, string>).NODE_ENV = "test";
    const response = await post("admin@example.invalid");
    expect(await response.json()).toEqual({ success: true, devOtp: "123456" });
    expect(sendOtp).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(0);
  });
});
