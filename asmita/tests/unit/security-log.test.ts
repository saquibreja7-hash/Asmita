import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { securityEventLog: { create: vi.fn() } },
}));

import { db } from "@/lib/db";
import { logSecurityEvent, securityEvents } from "@/lib/security-log";

describe("security-log", () => {
  const originalFlag = process.env.SECURITY_LOG_PERSISTENCE;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    securityEvents.splice(0, securityEvents.length);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(db.securityEventLog.create).mockResolvedValue({} as never);
  });

  afterEach(() => {
    process.env.SECURITY_LOG_PERSISTENCE = originalFlag;
    warnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("always appends to the in-memory ring and logs to stderr", () => {
    delete process.env.SECURITY_LOG_PERSISTENCE;
    logSecurityEvent({ event: "csrf_failed", route: "/api/x" });
    expect(securityEvents).toHaveLength(1);
    expect(securityEvents[0].event).toBe("csrf_failed");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("does not write to the DB by default", () => {
    delete process.env.SECURITY_LOG_PERSISTENCE;
    logSecurityEvent({ event: "auth_failed", route: "/api/y" });
    expect(db.securityEventLog.create).not.toHaveBeenCalled();
  });

  it("writes to the DB when SECURITY_LOG_PERSISTENCE=database", async () => {
    process.env.SECURITY_LOG_PERSISTENCE = "database";
    logSecurityEvent({ event: "rate_limit_exceeded", actorHash: "hash-1", route: "/api/z", reason: "ip:10.0.0.1" });
    await Promise.resolve();
    expect(db.securityEventLog.create).toHaveBeenCalledWith({
      data: {
        event: "rate_limit_exceeded",
        actorHash: "hash-1",
        route: "/api/z",
        reason: "ip:10.0.0.1",
      },
    });
  });

  it("swallows DB errors so the request path is never blocked", async () => {
    process.env.SECURITY_LOG_PERSISTENCE = "database";
    const dbError = new Error("connection refused");
    vi.mocked(db.securityEventLog.create).mockRejectedValueOnce(dbError);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => logSecurityEvent({ event: "csrf_failed", route: "/api/x" })).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
