import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    platform: { findUnique: vi.fn(), update: vi.fn() },
    platformGoHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

vi.mock("@/lib/csrf", async (orig) => {
  const real = await orig<typeof import("@/lib/csrf")>();
  return { ...real };
});

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { POST } from "@/app/api/admin/platforms/[platformId]/route";

function csrfPost(platformId: string, body: unknown) {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test/api/admin/platforms/${platformId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `asmita_csrf=${nonce}`,
      "x-csrf-token": token,
    },
    body: JSON.stringify(body),
  });
}

function noCsrfPost(platformId: string, body: unknown) {
  return new Request(`https://asmita.test/api/admin/platforms/${platformId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const okAdmin = {
  ok: true as const,
  session: {
    sub: "admin-1",
    role: "ADMIN" as const,
    ageOver18: true,
    emailHash: "hash-admin",
    namespace: "admin" as const,
  },
};

function makeParams(platformId: string) {
  return { params: Promise.resolve({ platformId }) };
}

describe("POST /api/admin/platforms/[platformId]", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects without CSRF", async () => {
    const res = await POST(
      noCsrfPost("p-1", { sourceUrl: "https://x.test/", markVerified: true, fields: {} }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, status: 403, error: "admin_required" } as never);
    const res = await POST(
      csrfPost("p-1", { sourceUrl: "https://x.test/", markVerified: true, fields: {} }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects malformed payload", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(okAdmin);
    const res = await POST(
      csrfPost("p-1", { markVerified: true, fields: {} }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when platform not found", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(null);
    const res = await POST(
      csrfPost("missing", { sourceUrl: "https://x.test/", markVerified: true, fields: {} }),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("records only changed fields and writes audit + history", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue({
      id: "p-1",
      name: "Example",
      grievanceEmail: "old@example.com",
      grievanceName: null,
      grievanceAddress: null,
      formUrl: null,
      apiEndpoint: null,
    } as never);

    const res = await POST(
      csrfPost("p-1", {
        sourceUrl: "https://platform.com/legal/grievance",
        markVerified: true,
        fields: {
          grievanceEmail: "new@example.com",
          grievanceName: "Jane Doe",
        },
      }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, changed: 2, markVerified: true });

    // The transaction is built from update + 2 history creates
    expect(db.$transaction).toHaveBeenCalledOnce();
    const txArg = vi.mocked(db.$transaction).mock.calls[0][0] as unknown;
    expect(Array.isArray(txArg)).toBe(true);
    expect((txArg as unknown[]).length).toBe(3);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GO_DATABASE_CHANGED",
        entityType: "Platform",
        entityId: "p-1",
        actorId: "admin-1",
        data: expect.objectContaining({
          platformName: "Example",
          sourceUrl: "https://platform.com/legal/grievance",
          changes: [
            { field: "grievanceEmail", previousValue: "old@example.com", newValue: "new@example.com" },
            { field: "grievanceName", previousValue: null, newValue: "Jane Doe" },
          ],
        }),
      }),
    );
  });

  it("returns no_changes when nothing differs and markVerified is false", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue({
      id: "p-1",
      name: "Example",
      grievanceEmail: "same@example.com",
      grievanceName: null,
      grievanceAddress: null,
      formUrl: null,
      apiEndpoint: null,
    } as never);

    const res = await POST(
      csrfPost("p-1", {
        sourceUrl: "https://x.test/",
        markVerified: false,
        fields: { grievanceEmail: "same@example.com" },
      }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, changed: 0, message: "no_changes" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("updates verification timestamp even when only re-verifying (no field changes)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue({
      id: "p-1",
      name: "Example",
      grievanceEmail: "same@example.com",
      grievanceName: null,
      grievanceAddress: null,
      formUrl: null,
      apiEndpoint: null,
    } as never);

    const res = await POST(
      csrfPost("p-1", {
        sourceUrl: "https://x.test/",
        markVerified: true,
        fields: { grievanceEmail: "same@example.com" },
      }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(writeAuditLog).toHaveBeenCalled();
  });
});
