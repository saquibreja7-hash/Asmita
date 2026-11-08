import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findUnique: vi.fn() },
    adminAccessLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createCsrfPair } from "@/lib/csrf";
import { POST } from "@/app/api/admin/urls/[urlId]/reveal/route";

type Mock = ReturnType<typeof vi.fn>;
const mocked = db as unknown as { submittedUrl: { findUnique: Mock }; adminAccessLog: { create: Mock } };

const reviewer = {
  ok: true as const,
  session: {
    sub: "admin-1",
    role: "ADMIN" as const,
    ageOver18: true,
    emailHash: "hash-admin",
    namespace: "admin" as const,
    adminRole: "CASE_REVIEWER" as const,
    mfaComplete: true,
  },
};

function reveal(body: unknown, withCsrf = true) {
  const { nonce, token } = createCsrfPair();
  return POST(
    new Request("https://asmita.test/api/admin/urls/u1/reveal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(withCsrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ urlId: "u1" }) },
  );
}

describe("POST /api/admin/urls/[urlId]/reveal", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(requireAdminPermission).mockResolvedValue(reviewer as never);
    mocked.submittedUrl.findUnique.mockResolvedValue({ id: "u1", urlEncrypted: "cipher", submittedAt: new Date() });
    mocked.adminAccessLog.create.mockResolvedValue({});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("needs the case review permission", async () => {
    await reveal({ reason: "check_removal" });
    expect(requireAdminPermission).toHaveBeenCalledWith("cases:review");
    mocked.submittedUrl.findUnique.mockClear();

    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    const response = await reveal({ reason: "check_removal" });
    expect(response.status).toBe(403);
    expect(mocked.submittedUrl.findUnique).not.toHaveBeenCalled();
  });

  it("refuses without CSRF or a reason", async () => {
    expect((await reveal({ reason: "check_removal" }, false)).status).toBe(403);
    expect((await reveal({})).status).toBe(400);
    expect((await reveal({ reason: "curiosity" })).status).toBe(400);
    expect(mocked.submittedUrl.findUnique).not.toHaveBeenCalled();
  });

  it("records the reveal, then returns the link uncached", async () => {
    const response = await reveal({ reason: "survivor_asked" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ url: "decrypted:cipher" });
    expect(mocked.adminAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-1",
        action: "url_revealed",
        entityType: "SubmittedUrl",
        entityId: "u1",
        reason: "survivor_asked",
      }),
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "URL_REVEALED", entityId: "u1", actorId: "admin-1", data: { reason: "survivor_asked" } }),
    );
  });

  it("does not show the link if the reveal cannot be recorded", async () => {
    mocked.adminAccessLog.create.mockRejectedValue(new Error("db down"));
    const response = await reveal({ reason: "check_removal" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "access_log_failed" });
  });

  it("returns 410 for a link past retention", async () => {
    mocked.submittedUrl.findUnique.mockResolvedValue({ id: "u1", urlEncrypted: "", submittedAt: new Date() });
    expect((await reveal({ reason: "check_removal" })).status).toBe(410);
    expect(mocked.adminAccessLog.create).not.toHaveBeenCalled();
  });

  it("limits reveals per admin", async () => {
    vi.mocked(checkRateLimitAsync).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await reveal({ reason: "check_removal" })).status).toBe(429);
    expect(checkRateLimitAsync).toHaveBeenCalledWith("admin-url-reveal:admin-1", 20, 3_600_000);
  });
});
