import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    platform: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    platformGoHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
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
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { POST } from "@/app/api/admin/platforms/[platformId]/route";
import { POST as VERIFY } from "@/app/api/admin/platforms/[platformId]/verify/route";

function csrfPost(platformId: string, body: unknown, path = "") {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test/api/admin/platforms/${platformId}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `asmita_csrf=${nonce}`,
      "x-csrf-token": token,
    },
    body: JSON.stringify(body),
  });
}

function noCsrfPost(platformId: string, body: unknown, path = "") {
  return new Request(`https://asmita.test/api/admin/platforms/${platformId}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminSession(sub: string, emailHash: string) {
  return {
    ok: true as const,
    session: {
      sub,
      role: "ADMIN" as const,
      ageOver18: true,
      emailHash,
      namespace: "admin" as const,
      adminRole: "SUPER_ADMIN" as const,
    },
  };
}

const okAdmin = adminSession("admin-1", "hash-admin");
const secondAdmin = adminSession("admin-2", "hash-admin-2");

function makeParams(platformId: string) {
  return { params: Promise.resolve({ platformId }) };
}

const CHANGED_AT = new Date("2026-11-01T10:00:00.000Z");

function platformRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    name: "Example",
    grievanceEmail: "old@example.com",
    grievanceName: null,
    grievanceAddress: null,
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: false,
    lastContactVerifiedAt: null,
    contactChangedBy: null,
    contactChangedAt: null,
    ...overrides,
  } as never;
}

// The update the edit route queued inside its transaction.
function queuedUpdateData() {
  return vi.mocked(db.platform.update).mock.calls[0][0].data as Record<string, unknown>;
}

describe("POST /api/admin/platforms/[platformId] (edit)", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects without CSRF", async () => {
    const res = await POST(
      noCsrfPost("p-1", { sourceUrl: "https://x.test/", fields: {} }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated admin", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "admin_required" } as never);
    const res = await POST(
      csrfPost("p-1", { sourceUrl: "https://x.test/", fields: {} }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects malformed payload", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    const res = await POST(csrfPost("p-1", { fields: {} }), makeParams("p-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when platform not found", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(null);
    const res = await POST(
      csrfPost("missing", { sourceUrl: "https://x.test/", fields: { grievanceEmail: "a@example.com" } }),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("refuses an edit that also asks to mark the contact verified, and writes nothing", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(platformRow());
    const res = await POST(
      csrfPost("p-1", {
        sourceUrl: "https://x.test/",
        markVerified: true,
        fields: { grievanceEmail: "attacker@example.com" },
      }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "verify_separately" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.platform.update).not.toHaveBeenCalled();
    expect(db.platform.updateMany).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("records only changed fields, writes audit + history, and leaves the contact unverified", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(platformRow());

    const res = await POST(
      csrfPost("p-1", {
        sourceUrl: "https://platform.com/legal/grievance",
        fields: {
          grievanceEmail: "new@example.com",
          grievanceName: "Jane Doe",
        },
      }),
      makeParams("p-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, changed: 2, needsVerification: true });

    // The transaction is built from update + 2 history creates
    expect(db.$transaction).toHaveBeenCalledOnce();
    const txArg = vi.mocked(db.$transaction).mock.calls[0][0] as unknown;
    expect(Array.isArray(txArg)).toBe(true);
    expect((txArg as unknown[]).length).toBe(3);

    expect(queuedUpdateData()).toMatchObject({
      grievanceEmail: "new@example.com",
      grievanceName: "Jane Doe",
      lastContactVerifiedByHuman: false,
      lastContactVerifiedAt: null,
      contactChangedBy: "hash-admin",
    });
    expect(queuedUpdateData().contactChangedAt).toBeInstanceOf(Date);

    expect(writeAuditLog).toHaveBeenCalledOnce();
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

  it.each(["grievanceEmail", "formUrl", "apiEndpoint", "grievanceName", "grievanceAddress"])(
    "a later edit to %s withdraws an existing verification",
    async (field) => {
      vi.mocked(requireAdminPermission).mockResolvedValue(secondAdmin);
      vi.mocked(db.platform.findUnique).mockResolvedValue(
        platformRow({
          lastContactVerifiedByHuman: true,
          lastContactVerifiedAt: new Date("2026-11-02T00:00:00.000Z"),
          contactChangedBy: "hash-admin",
          contactChangedAt: CHANGED_AT,
        }),
      );
      const value = field.endsWith("Email") ? "changed@example.com" : field.endsWith("Url") || field === "apiEndpoint" ? "https://changed.example.com/x" : "Changed value";

      const res = await POST(
        csrfPost("p-1", { sourceUrl: "https://x.test/", fields: { [field]: value } }),
        makeParams("p-1"),
      );
      expect(res.status).toBe(200);
      expect(queuedUpdateData()).toMatchObject({
        [field]: value,
        lastContactVerifiedByHuman: false,
        lastContactVerifiedAt: null,
        contactChangedBy: "hash-admin-2",
      });
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "GO_DATABASE_CHANGED",
          actorId: "admin-2",
          data: expect.objectContaining({ verificationWithdrawn: true }),
        }),
      );
    },
  );

  it("returns no_changes when nothing differs", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(platformRow({ grievanceEmail: "same@example.com" }));

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
});

describe("POST /api/admin/platforms/[platformId]/verify", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const verifyBody = { sourceUrl: "https://platform.com/legal/grievance", contactChangedAt: CHANGED_AT.toISOString() };

  it("rejects without CSRF", async () => {
    const res = await VERIFY(noCsrfPost("p-1", verifyBody, "/verify"), makeParams("p-1"));
    expect(res.status).toBe(403);
    expect(db.platform.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an admin without platforms:edit", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    const res = await VERIFY(csrfPost("p-1", verifyBody, "/verify"), makeParams("p-1"));
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("platforms:edit");
    expect(db.platform.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to let the admin who changed the contact verify it", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(
      platformRow({ contactChangedBy: "hash-admin", contactChangedAt: CHANGED_AT }),
    );
    const res = await VERIFY(csrfPost("p-1", verifyBody, "/verify"), makeParams("p-1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "second_admin_required" });
    expect(db.platform.updateMany).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("lets a different admin verify, conditional on the contact being unchanged, and audits it separately", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(secondAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(
      platformRow({ contactChangedBy: "hash-admin", contactChangedAt: CHANGED_AT }),
    );
    vi.mocked(db.platform.updateMany).mockResolvedValue({ count: 1 });

    const res = await VERIFY(csrfPost("p-1", verifyBody, "/verify"), makeParams("p-1"));
    expect(res.status).toBe(200);
    expect(db.platform.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", contactChangedBy: "hash-admin", contactChangedAt: CHANGED_AT },
      data: { lastContactVerifiedByHuman: true, lastContactVerifiedAt: expect.any(Date) },
    });
    expect(writeAuditLog).toHaveBeenCalledOnce();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GO_CONTACT_VERIFIED",
        entityType: "Platform",
        entityId: "p-1",
        actorId: "admin-2",
        data: expect.objectContaining({ sourceUrl: verifyBody.sourceUrl, contactChangedAt: CHANGED_AT.toISOString() }),
      }),
    );
  });

  it("refuses when the contact changed after the verifier loaded it", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(secondAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(
      platformRow({ contactChangedBy: "hash-admin", contactChangedAt: new Date("2026-11-03T00:00:00.000Z") }),
    );
    const res = await VERIFY(csrfPost("p-1", verifyBody, "/verify"), makeParams("p-1"));
    expect(res.status).toBe(409);
    expect(db.platform.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when an edit lands between the read and the write", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(secondAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(
      platformRow({ contactChangedBy: "hash-admin", contactChangedAt: CHANGED_AT }),
    );
    vi.mocked(db.platform.updateMany).mockResolvedValue({ count: 0 });
    const res = await VERIFY(csrfPost("p-1", verifyBody, "/verify"), makeParams("p-1"));
    expect(res.status).toBe(409);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns 404 when platform not found", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(secondAdmin);
    vi.mocked(db.platform.findUnique).mockResolvedValue(null);
    const res = await VERIFY(csrfPost("missing", verifyBody, "/verify"), makeParams("missing"));
    expect(res.status).toBe(404);
  });
});

describe("edit then verify, end to end over the two routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("one admin cannot change and verify; a second admin can", async () => {
    // A simple in-memory row the mocked db reads and writes.
    let row = platformRow() as unknown as Record<string, unknown>;
    vi.mocked(db.platform.findUnique).mockImplementation((async () => ({ ...row })) as never);
    vi.mocked(db.platform.update).mockImplementation(((args: { data: Record<string, unknown> }) => {
      row = { ...row, ...args.data };
      return {} as never;
    }) as never);
    vi.mocked(db.$transaction).mockImplementation(async () => []);
    vi.mocked(db.platform.updateMany).mockImplementation((async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const matches = Object.entries(args.where).every(([key, value]) =>
        value instanceof Date ? (row[key] as Date | null)?.getTime() === value.getTime() : row[key] === value,
      );
      if (!matches) return { count: 0 };
      row = { ...row, ...args.data };
      return { count: 1 };
    }) as never);

    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    const edit = await POST(
      csrfPost("p-1", { sourceUrl: "https://x.test/", fields: { grievanceEmail: "new@example.com" } }),
      makeParams("p-1"),
    );
    expect(edit.status).toBe(200);
    expect(row.lastContactVerifiedByHuman).toBe(false);
    const seen = (row.contactChangedAt as Date).toISOString();

    const selfVerify = await VERIFY(
      csrfPost("p-1", { sourceUrl: "https://x.test/", contactChangedAt: seen }, "/verify"),
      makeParams("p-1"),
    );
    expect(selfVerify.status).toBe(403);
    expect(row.lastContactVerifiedByHuman).toBe(false);

    vi.mocked(requireAdminPermission).mockResolvedValue(secondAdmin);
    const otherVerify = await VERIFY(
      csrfPost("p-1", { sourceUrl: "https://x.test/", contactChangedAt: seen }, "/verify"),
      makeParams("p-1"),
    );
    expect(otherVerify.status).toBe(200);
    expect(row.lastContactVerifiedByHuman).toBe(true);
    expect(row.grievanceEmail).toBe("new@example.com");

    // The verifier now edits: verification is withdrawn again and the first
    // admin becomes the one who may verify.
    const laterEdit = await POST(
      csrfPost("p-1", { sourceUrl: "https://x.test/", fields: { formUrl: "https://example.com/report" } }),
      makeParams("p-1"),
    );
    expect(laterEdit.status).toBe(200);
    expect(row.lastContactVerifiedByHuman).toBe(false);
    expect(row.lastContactVerifiedAt).toBeNull();
    expect(row.contactChangedBy).toBe("hash-admin-2");
  });
});
