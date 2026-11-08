import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findUnique: vi.fn(), update: vi.fn((args: unknown) => ({ op: "notice.update", args })) },
    submittedUrl: { update: vi.fn((args: unknown) => ({ op: "submittedUrl.update", args })) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { POST } from "@/app/api/admin/notices/[noticeId]/response/route";

type Mock = ReturnType<typeof vi.fn>;
const mocked = db as unknown as {
  notice: { findUnique: Mock; update: Mock };
  submittedUrl: { update: Mock };
  $transaction: Mock;
};

const sentAt = new Date(Date.now() - 10 * 3_600_000);

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

function record(body: unknown, withCsrf = true) {
  const { nonce, token } = createCsrfPair();
  return POST(
    new Request("https://asmita.test/api/admin/notices/n1/response", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(withCsrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ noticeId: "n1" }) },
  );
}

function notice(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    urlId: "u1",
    sentAt,
    followUpOf: null,
    removedAt: null,
    submittedUrl: { caseId: "c1", status: "NOTICE_QUEUED" },
    ...overrides,
  };
}

describe("POST /api/admin/notices/[noticeId]/response", () => {
  beforeEach(() => {
    vi.mocked(requireAdminPermission).mockResolvedValue(reviewer as never);
    mocked.notice.findUnique.mockResolvedValue(notice());
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("needs CSRF, the review permission and a known reply", async () => {
    expect((await record({ responseType: "REMOVED" }, false)).status).toBe(403);
    expect((await record({ responseType: "MAYBE" })).status).toBe(400);
    vi.mocked(requireAdminPermission).mockResolvedValueOnce({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await record({ responseType: "REMOVED" })).status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("cases:review");
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it("records a removal on the notice and the link, which stops the ladder", async () => {
    const receivedAt = new Date(Date.now() - 3_600_000).toISOString();
    const response = await record({ responseType: "REMOVED", receivedAt });

    expect(response.status).toBe(200);
    const [ops] = mocked.$transaction.mock.calls[0];
    expect(ops).toEqual([
      {
        op: "notice.update",
        args: {
          where: { id: "n1" },
          data: { responseType: "REMOVED", responseReceivedAt: new Date(receivedAt), removedAt: new Date(receivedAt) },
        },
      },
      { op: "submittedUrl.update", args: { where: { id: "u1" }, data: { status: "REMOVED" } } },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "CONTENT_REMOVED", entityId: "u1", actorId: "admin-1" }),
    );
  });

  it("records an acknowledgement on the notice only", async () => {
    await record({ responseType: "ACKNOWLEDGED" });

    const [ops] = mocked.$transaction.mock.calls[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].args.data).toMatchObject({ responseType: "ACKNOWLEDGED" });
    expect(ops[0].args.data).not.toHaveProperty("removedAt");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ADMIN_ACTION",
        entityType: "Notice",
        entityId: "n1",
        data: expect.objectContaining({ action: "platform_reply_recorded", responseType: "ACKNOWLEDGED" }),
      }),
    );
  });

  it("refuses follow-ups, unsent notices and links already removed", async () => {
    mocked.notice.findUnique.mockResolvedValueOnce(notice({ followUpOf: "n0" }));
    expect((await record({ responseType: "REJECTED" })).status).toBe(409);
    mocked.notice.findUnique.mockResolvedValueOnce(notice({ sentAt: null }));
    expect((await record({ responseType: "REJECTED" })).status).toBe(409);
    mocked.notice.findUnique.mockResolvedValueOnce(notice({ submittedUrl: { caseId: "c1", status: "REMOVED" } }));
    expect(await (await record({ responseType: "ACKNOWLEDGED" })).json()).toEqual({ error: "already_removed" });
    mocked.notice.findUnique.mockResolvedValueOnce(null);
    expect((await record({ responseType: "REMOVED" })).status).toBe(404);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a reply time before the notice or in the future", async () => {
    const before = new Date(sentAt.getTime() - 60_000).toISOString();
    expect(await (await record({ responseType: "REMOVED", receivedAt: before })).json()).toEqual({
      error: "reply_before_notice",
    });
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(await (await record({ responseType: "REMOVED", receivedAt: future })).json()).toEqual({
      error: "reply_in_future",
    });
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });
});
