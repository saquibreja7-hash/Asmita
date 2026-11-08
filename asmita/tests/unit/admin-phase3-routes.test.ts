import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

vi.mock("@/lib/case-ops", async (original) => ({
  isAwaitingReview: (await original<typeof import("@/lib/case-ops")>()).isAwaitingReview,
  reviewSubmittedUrl: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-cases", () => ({
  getAdminCaseDetail: vi.fn(),
}));

vi.mock("@/lib/admin-access-log", () => ({
  recordAdminAccess: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { reviewSubmittedUrl } from "@/lib/case-ops";
import { getAdminCaseDetail } from "@/lib/admin-cases";
import { recordAdminAccess } from "@/lib/admin-access-log";
import { createCsrfPair } from "@/lib/csrf";
import { POST as bulkLinks } from "@/app/api/admin/bulk/links/route";
import { GET as caseDetail } from "@/app/api/admin/cases/[reference]/route";

type Mock = ReturnType<typeof vi.fn>;
const mocked = db as unknown as { submittedUrl: { findMany: Mock } };

function admin(adminRole: string) {
  return {
    ok: true as const,
    session: {
      sub: "admin-1",
      role: "ADMIN" as const,
      ageOver18: true,
      emailHash: "hash-admin",
      namespace: "admin" as const,
      adminRole,
      mfaComplete: true,
    },
  };
}

function bulk(body: unknown, withCsrf = true) {
  const { nonce, token } = createCsrfPair();
  return bulkLinks(
    new Request("https://asmita.test/api/admin/bulk/links", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(withCsrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/admin/bulk/links", () => {
  beforeEach(() => {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("CASE_REVIEWER") as never);
    mocked.submittedUrl.findMany.mockResolvedValue([
      { id: "u1", caseId: "c1", status: "PENDING_REVIEW", flaggedForReview: true },
      { id: "u2", caseId: "c2", status: "NOTICE_QUEUED", flaggedForReview: true },
      { id: "u3", caseId: "c3", status: "REJECTED", flaggedForReview: false },
      { id: "u4", caseId: "c4", status: "NOTICE_QUEUED", flaggedForReview: false },
    ]);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("needs CSRF and the review permission", async () => {
    expect((await bulk({ decision: "approve", urlIds: ["u1"] }, false)).status).toBe(403);
    vi.mocked(requireAdminPermission).mockResolvedValueOnce({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await bulk({ decision: "approve", urlIds: ["u1"] })).status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("cases:review");
    expect(reviewSubmittedUrl).not.toHaveBeenCalled();
  });

  it("needs a reason to reject and caps a run at 50", async () => {
    expect(await (await bulk({ decision: "reject", urlIds: ["u1"] })).json()).toEqual({ error: "reason_required" });
    expect(await (await bulk({ decision: "reject", urlIds: ["u1"], reason: "  " })).json()).toEqual({ error: "reason_required" });
    const tooMany = Array.from({ length: 51 }, (_, index) => `u${index}`);
    expect((await bulk({ decision: "approve", urlIds: tooMany })).status).toBe(400);
    expect(reviewSubmittedUrl).not.toHaveBeenCalled();
  });

  it("reviews only links still waiting, each on its own, and reports failures first", async () => {
    vi.mocked(reviewSubmittedUrl).mockRejectedValueOnce(new Error("unknown_platform_requires_investigation"));
    const response = await bulk({ decision: "approve", urlIds: ["u1", "u2", "u3", "u4", "u5", "u1"] });
    const body = await response.json();

    expect(reviewSubmittedUrl).toHaveBeenCalledTimes(2);
    expect(reviewSubmittedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "c2", urlId: "u2", decision: "approve", reviewerId: "admin-1" }),
    );
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(4);
    expect(body.results).toEqual([
      { urlId: "u1", ok: false, error: "unknown_platform_requires_investigation" },
      { urlId: "u3", ok: false, error: "not_awaiting_review" },
      { urlId: "u4", ok: false, error: "not_awaiting_review" },
      { urlId: "u5", ok: false, error: "url_not_found" },
      { urlId: "u2", ok: true },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ADMIN_ACTION",
        actorId: "admin-1",
        data: { action: "bulk_link_review", decision: "approve", requested: 5, succeeded: 1, failed: 4 },
      }),
    );
  });

  it("passes the rejection reason to every link", async () => {
    await bulk({ decision: "reject", urlIds: ["u1", "u2"], reason: "Not the survivor's content" });
    expect(vi.mocked(reviewSubmittedUrl).mock.calls.map(([input]) => input.reason)).toEqual([
      "Not the survivor's content",
      "Not the survivor's content",
    ]);
  });
});

describe("GET /api/admin/cases/[reference]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const call = (reference: string) =>
    caseDetail(new Request(`https://asmita.test/api/admin/cases/${reference}`), {
      params: Promise.resolve({ reference }),
    });

  it("needs read permission and returns 404 for an unknown case", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValueOnce({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await call("ASMITA-2026-AAAAAA")).status).toBe(403);

    vi.mocked(requireAdminPermission).mockResolvedValue(admin("SUPPORT_AGENT") as never);
    vi.mocked(getAdminCaseDetail).mockResolvedValueOnce(null);
    expect((await call("ASMITA-2026-AAAAAA")).status).toBe(404);
    expect(recordAdminAccess).not.toHaveBeenCalled();
  });

  it("logs the view, is never cached and says whether the role can review", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("SUPPORT_AGENT") as never);
    vi.mocked(getAdminCaseDetail).mockResolvedValueOnce({ caseId: "c1", referenceNumber: "ASMITA-2026-AAAAAA" } as never);

    const response = await call("ASMITA-2026-AAAAAA");

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ canReview: false, detail: { caseId: "c1" } });
    expect(recordAdminAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "case_viewed", entityId: "c1", adminId: "admin-1" }),
      expect.anything(),
    );
  });
});
