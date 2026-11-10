import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A small in-memory stand-in for the Prisma client: enough of the delegate API
// for hardDeleteDueUsers, with the schema's RESTRICT / SET NULL foreign keys
// enforced on delete and $transaction rolling back on a throw. All values are
// placeholders; no real survivor data, links or fingerprints.
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {};
  const failOnce: { table?: string } = {};

  // [child table, child column, parent table, on delete]
  const foreignKeys: Array<[string, string, string, "RESTRICT" | "SET NULL"]> = [
    ["case", "userId", "user", "RESTRICT"],
    ["sessionToken", "userId", "user", "RESTRICT"],
    ["submittedUrl", "caseId", "case", "RESTRICT"],
    ["hashSubmission", "caseId", "case", "RESTRICT"],
    ["deletionJob", "caseId", "case", "RESTRICT"],
    ["feedback", "caseId", "case", "SET NULL"],
    ["notice", "urlId", "submittedUrl", "RESTRICT"],
    ["urlPortalToken", "urlId", "submittedUrl", "RESTRICT"],
    ["escalation", "noticeId", "notice", "RESTRICT"],
    ["hashDispatch", "noticeId", "notice", "SET NULL"],
    ["hashDispatch", "hashSubmissionId", "hashSubmission", "RESTRICT"],
  ];

  function matches(row: Row, where: Where = {}): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === "OR") return (condition as Where[]).some((part) => matches(row, part));
      if (condition && typeof condition === "object" && !Array.isArray(condition) && !(condition instanceof Date)) {
        const c = condition as { in?: unknown[]; lte?: Date };
        if (c.in) return c.in.includes(row[key]);
        if (c.lte) return (row[key] as Date).getTime() <= c.lte.getTime();
        throw new Error(`unsupported condition on ${key}`);
      }
      return row[key] === condition;
    });
  }

  function project(table: string, row: Row, select?: Record<string, unknown>): Row {
    if (!select) return { ...row };
    const out: Row = {};
    for (const [key, value] of Object.entries(select)) {
      if (key === "case" && table === "deletionJob") {
        const parent = tables.case.find((c) => c.id === row.caseId)!;
        out.case = project("case", parent, (value as { select: Record<string, unknown> }).select);
      } else {
        out[key] = row[key];
      }
    }
    return out;
  }

  function maybeFail(table: string) {
    if (failOnce.table === table) {
      failOnce.table = undefined;
      throw Object.assign(new Error("connection reset while deleting placeholder@example.org"), { code: "P1017" });
    }
  }

  function delegate(table: string) {
    const rows = () => (tables[table] ??= []);
    return {
      findMany: async ({ where, select }: { where?: Where; select?: Record<string, unknown> } = {}) =>
        rows().filter((r) => matches(r, where)).map((r) => project(table, r, select)),
      findUnique: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => {
        const row = rows().find((r) => matches(r, where));
        return row ? project(table, row, select) : null;
      },
      count: async ({ where }: { where?: Where } = {}) => rows().filter((r) => matches(r, where)).length,
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        maybeFail(table);
        const hit = rows().filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      update: async ({ where, data }: { where: Where; data: Row }) => {
        maybeFail(table);
        const row = rows().find((r) => matches(r, where));
        if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
        return Object.assign(row, data);
      },
      deleteMany: async ({ where }: { where: Where }) => {
        maybeFail(table);
        const doomed = rows().filter((r) => matches(r, where));
        const ids = new Set(doomed.map((r) => r.id));
        for (const [child, column, parent, onDelete] of foreignKeys) {
          if (parent !== table) continue;
          for (const childRow of tables[child] ?? []) {
            if (!ids.has(childRow[column])) continue;
            if (onDelete === "SET NULL") childRow[column] = null;
            else throw Object.assign(new Error("foreign key"), { code: "P2003", meta: { constraint: `${child}_${column}_fkey` } });
          }
        }
        tables[table] = rows().filter((r) => !ids.has(r.id));
        return { count: doomed.length };
      },
    };
  }

  const client = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          const snapshot = structuredClone(tables);
          try {
            return await fn(client);
          } catch (err) {
            for (const key of Object.keys(tables)) delete tables[key];
            Object.assign(tables, snapshot);
            throw err;
          }
        };
      }
      return delegate(prop);
    },
  });

  return { tables, failOnce, client };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db: fake.client }));

import { inMemoryAuditLog } from "@/lib/audit";
import { securityEvents } from "@/lib/security-log";
import { countFailedDeletionJobs, hardDeleteDueUsers, HARD_DELETE_RETAINED } from "@/lib/case-ops";

const due = new Date("2026-12-01T00:00:00Z");
const now = new Date("2026-12-01T01:00:00Z");

function seed() {
  for (const key of Object.keys(fake.tables)) delete fake.tables[key];
  Object.assign(fake.tables, {
    user: [
      { id: "u1", emailHash: "email-hash-u1", emailEncrypted: "enc:email-u1", preferredLocale: "hi", lastActiveAt: due, deactivatedAt: due },
      { id: "u2", emailHash: "email-hash-u2", emailEncrypted: "enc:email-u2", preferredLocale: null, lastActiveAt: null, deactivatedAt: null },
    ],
    case: [
      {
        id: "c1", referenceNumber: "ASM-TEST-0001", userId: "u1", status: "OPEN", registrationKeyHash: "reg-hash",
        state: "Placeholder State", city: "Placeholder City", ngoVerifierId: "ngo-1", declarationSignedAt: due,
        declarationIpHash: "ip-hash", firPackageGeneratedAt: due, signedHashAdvisoryPdf: "enc:advisory-pdf",
        hashAdvisoryPlatformIds: ["p1"], hashAdvisorySignedHashIds: ["h1", "h2"],
      },
      {
        id: "c2", referenceNumber: "ASM-TEST-0002", userId: "u2", status: "OPEN", registrationKeyHash: null,
        state: "Other State", city: null, ngoVerifierId: null, declarationSignedAt: null, declarationIpHash: null,
        firPackageGeneratedAt: null, signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [], hashAdvisorySignedHashIds: [],
      },
    ],
    submittedUrl: [
      { id: "url1", caseId: "c1", urlEncrypted: "enc:link-1", urlHash: "link-hash-1", signedNoticePdf: "enc:notice-pdf-1" },
      { id: "url2", caseId: "c1", urlEncrypted: "enc:link-2", urlHash: "link-hash-2", signedNoticePdf: null },
      { id: "url3", caseId: "c2", urlEncrypted: "enc:link-3", urlHash: "link-hash-3", signedNoticePdf: null },
    ],
    notice: [
      { id: "n1", urlId: "url1", messageId: "msg-notice-1", followUpOf: null },
      { id: "n2", urlId: "url1", messageId: "msg-followup-1", followUpOf: "n1" },
      { id: "n3", urlId: "url3", messageId: "msg-notice-3", followUpOf: null },
    ],
    escalation: [{ id: "e1", noticeId: "n1" }],
    urlPortalToken: [{ id: "t1", urlId: "url2" }],
    hashSubmission: [
      { id: "h1", caseId: "c1", hashEncrypted: "enc:fingerprint-1", hashDigest: "digest-1" },
      { id: "h2", caseId: "c1", hashEncrypted: "enc:fingerprint-2", hashDigest: "digest-2" },
    ],
    hashDispatch: [
      { id: "d1", hashSubmissionId: "h1", platformId: "p1", noticeId: null },
      { id: "d2", hashSubmissionId: "h2", platformId: "p1", noticeId: "n1" },
    ],
    emailDeliveryProof: [
      { id: "proof1", messageId: "msg-notice-1" },
      { id: "proof2", messageId: "msg-followup-1" },
      { id: "proof3", messageId: "msg-advisory-1" },
      { id: "proof4", messageId: "msg-notice-3" },
    ],
    auditLog: [
      { id: "a1", eventType: "HASH_DISPATCHED", entityId: "c1", data: { platformId: "p1", messageId: "msg-advisory-1", hashCount: 2 } },
      { id: "a2", eventType: "NOTICE_SENT", entityId: "url1", data: {} },
    ],
    feedback: [
      { id: "f1", caseId: null, caseReference: "ASM-TEST-0001", comment: "enc:comment" },
      { id: "f2", caseId: null, caseReference: "ASM-TEST-0002", comment: null },
    ],
    adminAccessLog: [
      { id: "l1", entityId: "url1", reason: "placeholder reveal reason" },
      { id: "l2", entityId: "url3", reason: "other case reason" },
    ],
    sessionToken: [{ id: "s1", userId: "u1" }, { id: "s2", userId: "u2" }],
    otpToken: [{ id: "o1", emailHash: "email-hash-u1" }, { id: "o2", emailHash: "email-hash-u2" }],
    deletionJob: [
      { id: "j1", caseId: "c1", scheduledAt: due, status: "SCHEDULED", completedAt: null, error: null },
      { id: "j2", caseId: "c2", scheduledAt: new Date("2027-01-01T00:00:00Z"), status: "SCHEDULED", completedAt: null, error: null },
    ],
  });
}

const rowsFor = (table: string, predicate: (row: Row) => boolean) => (fake.tables[table] ?? []).filter(predicate);

describe("hardDeleteDueUsers (database path)", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://placeholder.invalid/asmita_test";
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
    securityEvents.splice(0, securityEvents.length);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    seed();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    fake.failOnce.table = undefined;
    vi.restoreAllMocks();
  });

  it("removes links, sent notices, fingerprints, dispatches and the signed advisory PDF", async () => {
    expect(await hardDeleteDueUsers(now)).toEqual(["u1"]);

    expect(rowsFor("submittedUrl", (r) => r.caseId === "c1")).toEqual([]);
    expect(rowsFor("notice", (r) => r.urlId === "url1")).toEqual([]);
    expect(fake.tables.escalation).toEqual([]);
    expect(fake.tables.urlPortalToken).toEqual([]);
    expect(rowsFor("hashSubmission", (r) => r.caseId === "c1")).toEqual([]);
    expect(fake.tables.hashDispatch).toEqual([]);
    expect(fake.tables.emailDeliveryProof.map((r) => r.id)).toEqual(["proof4"]);
    expect(fake.tables.feedback.map((r) => r.id)).toEqual(["f2"]);
    expect(fake.tables.sessionToken.map((r) => r.id)).toEqual(["s2"]);
    expect(fake.tables.otpToken.map((r) => r.id)).toEqual(["o2"]);
    expect(fake.tables.adminAccessLog).toEqual([
      { id: "l1", entityId: "url1", reason: null },
      { id: "l2", entityId: "url3", reason: "other case reason" },
    ]);

    expect(fake.tables.case.find((c) => c.id === "c1")).toMatchObject({
      id: "c1", referenceNumber: "ASM-TEST-0001", userId: "u1", status: "CLOSED", registrationKeyHash: null,
      state: null, city: null, ngoVerifierId: null, declarationSignedAt: null, declarationIpHash: null,
      firPackageGeneratedAt: null, signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [], hashAdvisorySignedHashIds: [],
    });
    expect(fake.tables.user.find((u) => u.id === "u1")).toMatchObject({
      emailHash: "deleted:u1", emailEncrypted: "deleted", preferredLocale: null, lastActiveAt: null, deactivatedAt: null,
    });
    expect(fake.tables.deletionJob.find((j) => j.id === "j1")).toMatchObject({ status: "COMPLETED", completedAt: now, error: null });

    // The other survivor is untouched.
    expect(rowsFor("submittedUrl", (r) => r.caseId === "c2")).toHaveLength(1);
    expect(rowsFor("notice", (r) => r.urlId === "url3")).toHaveLength(1);
    expect(fake.tables.user.find((u) => u.id === "u2")).toMatchObject({ emailHash: "email-hash-u2" });
    expect(fake.tables.case.find((c) => c.id === "c2")).toMatchObject({ status: "OPEN", state: "Other State" });
    expect(fake.tables.deletionJob.find((j) => j.id === "j2")).toMatchObject({ status: "SCHEDULED" });

    // Nothing that was the survivor's remains anywhere in the fake database.
    const serialized = JSON.stringify(fake.tables);
    for (const secret of [
      "email-hash-u1", "enc:email-u1", "enc:link-1", "link-hash-1", "enc:notice-pdf-1", "enc:fingerprint-1",
      "digest-1", "enc:advisory-pdf", "Placeholder State", "Placeholder City", "reg-hash", "ip-hash",
      "enc:comment", "placeholder reveal reason", "msg-notice-1", "msg-followup-1",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("writes an audit entry that says exactly what was removed and kept", async () => {
    await hardDeleteDueUsers(now);
    const entries = inMemoryAuditLog.filter((e) => e.eventType === "CASE_HARD_DELETED");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entityType: "User",
      entityId: "u1",
      data: {
        removed: {
          cases: 1, links: 2, notices: 2, escalations: 1, fingerprints: 2, fingerprintDispatches: 2,
          deliveryProofs: 3, feedback: 1, sessions: 1, otpCodes: 1,
        },
        retained: HARD_DELETE_RETAINED,
      },
    });
    expect(JSON.stringify(entries[0].data)).not.toContain("audit_metadata_only");
  });

  it("rolls back a failed deletion, marks it FAILED without PII, and retries it on the next sweep", async () => {
    fake.failOnce.table = "hashDispatch";

    expect(await hardDeleteDueUsers(now)).toEqual([]);
    // Nothing was half-deleted.
    expect(rowsFor("submittedUrl", (r) => r.caseId === "c1")).toHaveLength(2);
    expect(rowsFor("hashSubmission", (r) => r.caseId === "c1")).toHaveLength(2);
    expect(fake.tables.user.find((u) => u.id === "u1")).toMatchObject({ emailHash: "email-hash-u1" });
    const job = fake.tables.deletionJob.find((j) => j.id === "j1")!;
    expect(job).toMatchObject({ status: "FAILED", error: "P1017" });
    expect(securityEvents).toEqual([expect.objectContaining({ event: "account_deletion_failed", reason: "P1017" })]);
    expect(JSON.stringify(securityEvents)).not.toContain("example.org");
    expect(await countFailedDeletionJobs()).toBe(1);
    expect(inMemoryAuditLog.some((e) => e.eventType === "CASE_HARD_DELETED")).toBe(false);

    expect(await hardDeleteDueUsers(new Date(now.getTime() + 60 * 60_000))).toEqual(["u1"]);
    expect(fake.tables.deletionJob.find((j) => j.id === "j1")).toMatchObject({ status: "COMPLETED", error: null });
    expect(rowsFor("submittedUrl", (r) => r.caseId === "c1")).toEqual([]);
    expect(await countFailedDeletionJobs()).toBe(0);
  });

  it("does not pick up jobs that are not yet due, completed or cancelled", async () => {
    fake.tables.deletionJob[0].status = "CANCELLED";
    expect(await hardDeleteDueUsers(now)).toEqual([]);
    expect(rowsFor("submittedUrl", (r) => r.caseId === "c1")).toHaveLength(2);
  });
});
