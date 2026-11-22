import { afterEach, describe, expect, it, vi } from "vitest";

// The Phase 3 case-detail API (the case list's slide-over panel). The bulk
// flagged-link route's own tests moved to tests/unit/bulk-links.test.ts in
// WP145, when the route gained the memory-backend path every console route
// has: the assertions there now run against the real dev store instead of a
// mocked Prisma client.

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/admin-cases", () => ({
  getAdminCaseDetail: vi.fn(),
}));

vi.mock("@/lib/admin-access-log", () => ({
  recordAdminAccess: vi.fn().mockResolvedValue(undefined),
}));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getAdminCaseDetail } from "@/lib/admin-cases";
import { recordAdminAccess } from "@/lib/admin-access-log";
import { GET as caseDetail } from "@/app/api/admin/cases/[reference]/route";

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
