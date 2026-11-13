import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  requireSession: vi.fn(),
  getCaseForUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { auditLog: { findMany: mocks.findMany }, feedback: { create: mocks.create } } }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: mocks.getCaseForUser }));

import { inMemoryAuditLog, readAuditTrail, writeAuditLog } from "@/lib/audit";
import { GET as getTrail } from "@/app/api/cases/[caseId]/audit-trail/route";

const ctx = (caseId: string) => ({ params: Promise.resolve({ caseId }) });

describe("audit trail reads", () => {
  beforeEach(() => {
    vi.stubEnv("ASMITA_DATABASE_DRIVER", "");
    mocks.findMany.mockReset();
    mocks.requireSession.mockResolvedValue({ ok: true, session: { sub: "user-1" } });
    mocks.getCaseForUser.mockResolvedValue({ id: "case-1" });
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("memory mode appends to and reads the in-memory array", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "memory");
    await writeAuditLog({ eventType: "CASE_CREATED", entityId: "case-1" });
    await writeAuditLog({ eventType: "CASE_CREATED", entityId: "case-2" });
    const events = await readAuditTrail("case-1");
    expect(events).toHaveLength(1);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("database mode reads audit_log, newest rows bounded, returned oldest first", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    mocks.findMany.mockResolvedValue([
      { sequence: 9, eventType: "NOTICE_SENT", entityType: "Case", entityId: "case-1", actorId: null, data: { a: 1 }, ipHash: null, previousHash: "p9", eventHash: "h9", createdAt: new Date("2026-11-02T00:00:00Z") },
      { sequence: 8, eventType: "CASE_CREATED", entityType: "Case", entityId: "case-1", actorId: "u", data: null, ipHash: null, previousHash: "p8", eventHash: "h8", createdAt: new Date("2026-11-01T00:00:00Z") },
    ]);
    const events = await readAuditTrail("case-1", 2);
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { entityId: "case-1" }, orderBy: { sequence: "desc" }, take: 2 });
    expect(events.map((e) => e.sequence)).toEqual([8, 9]);
    expect(events[0]).toEqual({
      eventType: "CASE_CREATED", entityType: "Case", entityId: "case-1", actorId: "u", sequence: 8,
      createdAt: "2026-11-01T00:00:00.000Z", previousHash: "p8", eventHash: "h8",
    });
  });

  it("database mode does not append to the in-memory array", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    // persistence will fail without a database; the write must still not throw or touch memory
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await writeAuditLog({ eventType: "CASE_CREATED", entityId: "case-1" });
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("route reads the database in database mode for the caller's own case", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    mocks.findMany.mockResolvedValue([]);
    const res = await getTrail(new Request("https://asmita.test"), ctx("case-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: [] });
    expect(mocks.getCaseForUser).toHaveBeenCalledWith("case-1", "user-1");
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ entityId: "case-1" });
  });

  it("route returns 404 and reads nothing when the case is not the caller's", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    mocks.getCaseForUser.mockResolvedValue(null);
    const res = await getTrail(new Request("https://asmita.test"), ctx("case-2"));
    expect(res.status).toBe(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("route returns only what, when and whether the survivor did it", async () => {
    vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
    mocks.findMany.mockResolvedValue([
      { sequence: 2, eventType: "URL_REJECTED", entityType: "SubmittedUrl", entityId: "case-1", actorId: "admin-abc", data: { reason: "internal note", hashIds: ["h1"] }, ipHash: "ip", previousHash: "p2", eventHash: "h2", createdAt: new Date("2026-11-02T00:00:00Z") },
      { sequence: 1, eventType: "CASE_CREATED", entityType: "Case", entityId: "case-1", actorId: "user-1", data: null, ipHash: "ip", previousHash: "p1", eventHash: "h1", createdAt: new Date("2026-11-01T00:00:00Z") },
    ]);
    const res = await getTrail(new Request("https://asmita.test"), ctx("case-1"));
    const body = await res.json();
    expect(body.events).toEqual([
      { sequence: 1, eventType: "CASE_CREATED", createdAt: "2026-11-01T00:00:00.000Z", byYou: true },
      { sequence: 2, eventType: "URL_REJECTED", createdAt: "2026-11-02T00:00:00.000Z", byYou: false },
    ]);
    const text = JSON.stringify(body);
    for (const leaked of ["admin-abc", "internal note", "h1", "ip", "p2", "actorId", "ipHash", "eventHash", "previousHash", "data"]) {
      expect(text).not.toContain(`"${leaked}"`);
    }
    expect(text).not.toContain("admin-abc");
    expect(text).not.toContain("internal note");
  });
});
