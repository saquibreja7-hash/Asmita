import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/middleware");
vi.mock("@/lib/case-ops");
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import * as middleware from "@/lib/auth/middleware";
import * as caseOps from "@/lib/case-ops";
import { writeAuditLog } from "@/lib/audit";
import { GET as exportRoute } from "@/app/api/cases/[caseId]/export/route";

const authed = {
  ok: true as const,
  session: {
    sub: "user-1",
    role: "VICTIM" as const,
    ageOver18: true,
    emailHash: "hash-1",
    namespace: "victim" as const,
    adminRole: undefined,
  },
};

function caseWith(referenceNumber: string) {
  return {
    id: "case-1",
    referenceNumber,
    userId: "user-1",
    createdAt: "2026-05-12T00:00:00.000Z",
    status: "OPEN",
    urls: [{ domain: "example.test", platformName: "Example Platform", status: "NOTICE_SENT" }],
  } as unknown as Awaited<ReturnType<typeof caseOps.getCaseForUser>>;
}

const ctx = { params: Promise.resolve({ caseId: "case-1" }) };
const request = () => new Request("https://asmita.test/api/cases/case-1/export");

afterEach(() => vi.clearAllMocks());

describe("GET /api/cases/[caseId]/export", () => {
  it("returns the PDF", async () => {
    vi.mocked(middleware.requireSession).mockResolvedValue(authed);
    vi.mocked(caseOps.getCaseForUser).mockResolvedValue(caseWith("ASMITA-2026-00001"));
    const res = await exportRoute(request(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect(writeAuditLog).toHaveBeenCalledOnce();
  });

  it("answers a failed build with a clean error, not a 500, and logs no case content", async () => {
    vi.mocked(middleware.requireSession).mockResolvedValue(authed);
    vi.mocked(caseOps.getCaseForUser).mockResolvedValue(caseWith("ASMITA\x00SECRET"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await exportRoute(request(), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "export_failed" });
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    log.mockRestore();
  });
});
