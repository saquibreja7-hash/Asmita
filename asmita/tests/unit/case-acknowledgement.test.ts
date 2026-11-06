import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), record: vi.fn(), email: vi.fn(), signable: vi.fn(), sent: vi.fn(), send: vi.fn(), audit: vi.fn(), csrf: vi.fn(),
}));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: mocks.record, getVerifiedUserEmail: mocks.email }));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: mocks.csrf }));
vi.mock("@/lib/dev-flags", () => ({ devFlagEnabled: () => false }));
vi.mock("@/lib/signable-notice", () => ({ findSignableNotice: mocks.signable }));
vi.mock("@/lib/email", () => ({ sendVictimConfirmation: mocks.send }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/db", () => ({ db: { auditLog: { findFirst: mocks.sent } } }));

import { POST } from "@/app/api/cases/[caseId]/acknowledge/route";

describe("case acknowledgement", () => {
  const invoke = () => POST(new Request("https://asmita.test/api/cases/case-1/acknowledge", { method: "POST" }), { params: Promise.resolve({ caseId: "case-1" }) });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    mocks.csrf.mockReturnValue(true);
    mocks.session.mockResolvedValue({ ok: true, session: { sub: "user-1" } });
    mocks.record.mockResolvedValue({ id: "case-1", referenceNumber: "ASMITA-2026-TEST", urls: [{ id: "url-1" }] });
    mocks.email.mockResolvedValue("survivor@example.invalid");
    mocks.signable.mockResolvedValue(null);
    mocks.sent.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ id: "test" });
  });
  it("does not send while a notice is still awaiting signature", async () => {
    mocks.signable.mockResolvedValue({ id: "url-1" });
    expect((await invoke()).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("sends after submission and does not send again once recorded", async () => {
    expect((await invoke()).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: { messageType: "victim_confirmation" } }));
    mocks.sent.mockResolvedValue({ id: "audit-1" });
    expect((await invoke()).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("does not send for another user's case", async () => {
    mocks.record.mockResolvedValue(null);
    expect((await invoke()).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
