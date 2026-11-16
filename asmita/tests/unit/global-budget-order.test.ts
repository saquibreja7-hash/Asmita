import { beforeEach, describe, expect, it, vi } from "vitest";

const limitCalls: string[] = [];
const blocked = new Set<string>();

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
vi.mock("@/lib/email", () => ({ sendOtp: vi.fn() }));
vi.mock("@/lib/auth/otp", () => ({ createOtpForEmail: vi.fn().mockResolvedValue({ token: "000000" }) }));

import { POST as requestOtp } from "@/app/api/auth/request-otp/route";
import { POST as chat } from "@/app/api/chat/route";

function otpRequest() {
  return new Request("https://asmita.test/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ email: "someone@example.com" }),
  });
}

function chatRequest() {
  return new Request("https://asmita.test/api/chat", {
    method: "POST",
    body: JSON.stringify({ locale: "en", messages: [{ role: "user", content: "hello" }] }),
  });
}

describe("global budgets are spent only after per-caller limits pass", () => {
  beforeEach(() => {
    limitCalls.length = 0;
    blocked.clear();
  });

  it.each(["otp:", "registration-domain:", "registration-ip:"])(
    "OTP: a request rejected by %s does not touch otp-global",
    async (prefix) => {
      blocked.add(prefix);
      const res = await requestOtp(otpRequest());
      expect(res.status).toBe(429);
      expect(limitCalls).not.toContain("otp-global");
    },
  );

  it("OTP: a request within every per-caller limit spends otp-global once", async () => {
    const res = await requestOtp(otpRequest());
    expect(res.status).toBe(200);
    expect(limitCalls.filter((key) => key === "otp-global")).toHaveLength(1);
  });

  it("OTP: an exhausted global budget still rejects", async () => {
    blocked.add("otp-global");
    const res = await requestOtp(otpRequest());
    expect(res.status).toBe(429);
  });

  it("chat: a request over its IP limit does not touch chat-message-global", async () => {
    blocked.add("chat-message-ip:");
    const res = await chat(chatRequest());
    expect(res.status).toBe(429);
    expect(limitCalls).not.toContain("chat-message-global");
  });
});
