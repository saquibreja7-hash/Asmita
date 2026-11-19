import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP31 (partner programme part 2): the survivor's partner-sharing agreement,
// src/lib/partner-share-consent.ts, on every back end — the in-memory store
// (no DATABASE_URL), the Prisma client (mocked like
// crawl-consent-tick.test.ts) and the Kysely worker path (recording fake from
// partner-admin-kysely.test.ts). Proves Rules 2 (live agreement + approved
// status), 3 (adult case at the query) and 4 (legal gate on the template) of
// docs/product/partner-sharing-spec.md, and that audits carry internal ids and
// counts only. Synthetic data only.

const mocks = vi.hoisted(() => {
  const prisma = {
    templateFindFirst: vi.fn(),
    consentFindMany: vi.fn(),
    consentFindFirst: vi.fn(),
    consentCreate: vi.fn(),
    consentUpdateMany: vi.fn(),
    hashFindMany: vi.fn(),
  };

  // The Kysely recording fake from partner-admin-kysely.test.ts, with one
  // addition: innerJoin records the joined table (like onConflict, the join
  // callback never runs in the fake).
  const kysely = (() => {
    const state = {
      rows: {} as Record<string, Array<Record<string, unknown>>>,
      calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
      updateResults: {} as Record<string, { numUpdatedRows: number }>,
    };

    function builder(op: string, table: string, detail: Record<string, unknown>) {
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "execute") return async () => selectRows(table, detail).map((row) => ({ ...row }));
            if (prop === "executeTakeFirst") {
              return async () => {
                if (op === "update" && !detail.returningAll) return state.updateResults[table] ?? { numUpdatedRows: 1 };
                return selectRows(table, detail)[0];
              };
            }
            if (prop === "then") return undefined;
            return (...args: unknown[]) => {
              if (prop === "values") detail.values = args[0];
              else if (prop === "set") detail.set = args[0];
              else if (prop === "select") detail.select = args[0];
              else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
              else if (prop === "innerJoin") detail.join = args[0];
              else if (prop === "onConflict") detail.onConflict = true;
              else if (prop === "returningAll") detail.returningAll = true;
              return proxy;
            };
          },
        },
      );
      return proxy;
    }

    function selectRows(table: string, detail: Record<string, unknown>) {
      let rows = state.rows[table] ?? [];
      for (const where of (detail.wheres as unknown[][] | undefined) ?? []) {
        const [column, operator, value] = where as [string, string, unknown];
        if (operator === "=") rows = rows.filter((row) => row[column] === value);
        else if (operator === "in" && Array.isArray(value)) rows = rows.filter((row) => value.includes(row[column]));
      }
      return rows;
    }

    function record(op: string, name: string) {
      const table = name.split(" ")[0];
      const detail: Record<string, unknown> = {};
      state.calls.push({ op, table, detail });
      return builder(op, table, detail);
    }

    const db = {
      selectFrom: (name: string) => record("select", name),
      insertInto: (name: string) => record("insert", name),
      updateTable: (name: string) => record("update", name),
      deleteFrom: (name: string) => record("delete", name),
      transaction: () => ({ execute: async (run: (tx: unknown) => Promise<unknown>) => run(db) }),
    };
    return { db, state };
  })();

  const usesWorkerKysely = vi.fn(() => false);
  return { prisma, kysely, usesWorkerKysely };
});

vi.mock("@/lib/db", () => {
  const db = {
    noticeTemplate: { findFirst: mocks.prisma.templateFindFirst },
    partnerShareConsent: {
      findMany: mocks.prisma.consentFindMany,
      findFirst: mocks.prisma.consentFindFirst,
      create: mocks.prisma.consentCreate,
      updateMany: mocks.prisma.consentUpdateMany,
    },
    hashSubmission: { findMany: mocks.prisma.hashFindMany },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});
vi.mock("@/lib/worker-kysely", () => ({
  usesWorkerKysely: mocks.usesWorkerKysely,
  getWorkerDb: () => mocks.kysely.db,
}));
// The Prisma rows below hold placeholder hex strings as hashEncrypted; the
// identity decrypt lets the real annex builder check them.
vi.mock("@/lib/encryption", () => ({
  encryptField: (value: string) => `enc:${value.length}`,
  decryptField: (value: string) => value,
}));

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory, type MemoryFingerprint } from "@/lib/crawl-store";
import {
  PARTNER_SHARE_STATUSES,
  PARTNER_SHARING_CONSENT_TYPE,
  buildPartnerSharingDraft,
  findPartnerSharingTemplate,
  getPartnerShareConsentState,
  isPartnerShareableStatus,
  listPartnerShareableFingerprints,
  recordPartnerShareConsent,
  withdrawPartnerShareConsent,
  withdrawPartnerShareConsentsForDeletion,
} from "@/lib/partner-share-consent";
import { erasePartnerShareConsentsForCases, partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { templateDigest, templateRef } from "@/lib/signed-template";
import { cases, type CaseRecord } from "@/lib/store";

const template = {
  id: "partner-template-1",
  platformId: null,
  templateType: "PARTNER_SHARING_CONSENT",
  subjectTemplate: "Agreement to share my image fingerprints - {{caseReference}}",
  bodyTemplate: "AGREEMENT for {{caseReference}} ({{declarationReference}})",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

const HEX_A = "ab".repeat(32);
const HEX_B = "cd".repeat(32);
const hashRows = [
  { id: "hash-1", hashEncrypted: HEX_A, quality: 95, clientVersion: "pdq-demo-1", algorithm: "PDQ" },
  { id: "hash-2", hashEncrypted: HEX_B, quality: 90, clientVersion: "pdq-demo-1", algorithm: "PDQ" },
];

function memoryCase(id: string, referenceNumber: string): CaseRecord {
  return { id, referenceNumber, userId: "user-1", createdAt: "2026-11-19T00:00:00.000Z", status: "OPEN", urls: [] };
}

function memoryFingerprint(id: string, caseId: string, status: MemoryFingerprint["status"], hexSalt: string) {
  crawlMemory().fingerprints.set(id, {
    id, caseId, hashEncrypted: hexSalt.repeat(64).slice(0, 64), quality: 100, status, crawlPoolId: null,
  });
}

function callsOn(table: string) {
  return mocks.kysely.state.calls.filter((call) => call.table === table);
}

function agree(caseId: string) {
  return recordPartnerShareConsent({
    caseId,
    hashSubmissionIds: ["hash-1"],
    templateId: template.id,
    templateDigest: templateDigest(template),
  });
}

beforeEach(() => {
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  resetPartnerMemory();
  resetCrawlMemory();
  cases.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("shareable statuses", () => {
  it("are APPROVED and DISPATCHED only, the same set the crawl pool uses", () => {
    expect(PARTNER_SHARE_STATUSES).toEqual(["APPROVED", "DISPATCHED"]);
    expect(PARTNER_SHARING_CONSENT_TYPE).toBe("PARTNER_SHARING_CONSENT");
    expect(isPartnerShareableStatus("APPROVED")).toBe(true);
    expect(isPartnerShareableStatus("DISPATCHED")).toBe(true);
    for (const status of ["PENDING_REVIEW", "REJECTED", ""]) {
      expect(isPartnerShareableStatus(status)).toBe(false);
    }
  });
});

describe("partner-share consent, in-memory store", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));

  it("tracks none → agreed → withdrawn, with one live agreement per case", async () => {
    expect(await getPartnerShareConsentState("case-1")).toEqual({
      status: "none", agreedAt: null, withdrawnAt: null, fingerprintCount: 0,
    });

    const first = await recordPartnerShareConsent({
      caseId: "case-1",
      hashSubmissionIds: ["hash-1", "hash-2"],
      templateId: template.id,
      templateDigest: templateDigest(template),
      agreedAt: new Date("2026-11-19T09:00:00.000Z"),
    });
    expect(first.ok).toBe(true);
    expect(await getPartnerShareConsentState("case-1")).toEqual({
      status: "agreed", agreedAt: "2026-11-19T09:00:00.000Z", withdrawnAt: null, fingerprintCount: 2,
    });

    // One live agreement per case (Rule 2).
    expect(await agree("case-1")).toEqual({ ok: false, error: "already_agreed" });

    expect(await withdrawPartnerShareConsent("case-1")).toEqual({ ok: true, consentsWithdrawn: 1 });
    const withdrawn = await getPartnerShareConsentState("case-1");
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.agreedAt).toBe("2026-11-19T09:00:00.000Z");
    expect(withdrawn.withdrawnAt).toEqual(expect.any(String));
    expect(withdrawn.fingerprintCount).toBe(0);
    expect(await withdrawPartnerShareConsent("case-1")).toEqual({ ok: false, error: "not_agreed" });

    // She can tick again after withdrawing; the old row stays as history.
    const again = await recordPartnerShareConsent({
      caseId: "case-1",
      hashSubmissionIds: ["hash-1"],
      templateId: template.id,
      templateDigest: templateDigest(template),
      agreedAt: new Date("2026-11-19T10:00:00.000Z"),
    });
    expect(again.ok).toBe(true);
    expect(await getPartnerShareConsentState("case-1")).toEqual({
      status: "agreed", agreedAt: "2026-11-19T10:00:00.000Z", withdrawnAt: null, fingerprintCount: 1,
    });
    await withdrawPartnerShareConsent("case-1", "user-1");
    expect(await getPartnerShareConsentState("case-1")).toEqual({
      status: "withdrawn",
      agreedAt: "2026-11-19T10:00:00.000Z",
      withdrawnAt: expect.any(String),
      fingerprintCount: 0,
    });
  });

  it("audits the tick and the withdrawal with internal ids and counts only", async () => {
    const saved = await recordPartnerShareConsent({
      caseId: "case-1",
      hashSubmissionIds: ["hash-1", "hash-2"],
      templateId: template.id,
      templateDigest: templateDigest(template),
      actorId: "user-1",
    });
    expect(saved.ok).toBe(true);
    await withdrawPartnerShareConsent("case-1", "user-1");

    expect(inMemoryAuditLog).toHaveLength(2);
    const [given, withdrawn] = inMemoryAuditLog;
    expect(given.eventType).toBe("PARTNER_SHARE_CONSENT_GIVEN");
    expect(given.entityType).toBe("Case");
    expect(given.entityId).toBe("case-1");
    expect(given.actorId).toBe("user-1");
    // Rule 6: internal ids and counts only, never hash values or personal data.
    expect(Object.keys(given.data ?? {}).sort()).toEqual(["consentId", "fingerprintCount"]);
    expect(given.data).toEqual({ consentId: (saved as { consentId: string }).consentId, fingerprintCount: 2 });
    expect(JSON.stringify(given.data)).not.toContain(HEX_A);

    expect(withdrawn.eventType).toBe("PARTNER_SHARE_CONSENT_WITHDRAWN");
    expect(withdrawn.entityId).toBe("case-1");
    expect(withdrawn.actorId).toBe("user-1");
    expect(withdrawn.data).toEqual({ reason: "survivor", consentsWithdrawn: 1 });
  });

  it("lists a fingerprint only with a live agreement, an approved status and a case record (Rule 2)", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    memoryFingerprint("hash-1", "case-1", "APPROVED", "a");
    memoryFingerprint("hash-2", "case-1", "DISPATCHED", "b");
    memoryFingerprint("hash-3", "case-1", "PENDING_REVIEW", "c");
    memoryFingerprint("hash-4", "case-1", "REJECTED", "d");
    memoryFingerprint("hash-5", "case-2", "APPROVED", "e"); // case-2 has no agreement

    expect(await listPartnerShareableFingerprints()).toEqual([]);

    await agree("case-1");
    await agree("case-3"); // live agreement, but case-3 has no case record
    memoryFingerprint("hash-6", "case-3", "APPROVED", "f");

    expect(await listPartnerShareableFingerprints()).toEqual([
      { hashSubmissionId: "hash-1", caseId: "case-1", caseReference: "ASMITA-2026-00001", algorithm: "PDQ" },
      { hashSubmissionId: "hash-2", caseId: "case-1", caseReference: "ASMITA-2026-00001", algorithm: "PDQ" },
    ]);

    // Withdrawal stops sharing at once.
    await withdrawPartnerShareConsent("case-1");
    expect(await listPartnerShareableFingerprints()).toEqual([]);
  });

  it("account deletion withdraws her live agreements with reason account_deletion", async () => {
    for (const caseId of ["case-1", "case-2", "case-3"]) await agree(caseId);
    await withdrawPartnerShareConsent("case-3"); // already withdrawn before the deletion request

    const withdrawn = await withdrawPartnerShareConsentsForDeletion(["case-1", "case-2", "case-3"], "user-1");
    expect(withdrawn).toBe(2);

    const events = inMemoryAuditLog.filter((event) => event.eventType === "PARTNER_SHARE_CONSENT_WITHDRAWN");
    const deletions = events.filter((event) => (event.data as Record<string, unknown>).reason === "account_deletion");
    expect(deletions.map((event) => event.entityId)).toEqual(["case-1", "case-2"]);
    for (const event of deletions) {
      expect(event.actorId).toBe("user-1");
      expect(event.data).toEqual({ reason: "account_deletion", consentsWithdrawn: 1 });
    }
    expect(await getPartnerShareConsentState("case-1")).toMatchObject({ status: "withdrawn" });
    expect(await getPartnerShareConsentState("case-2")).toMatchObject({ status: "withdrawn" });
  });

  it("erasure removes the agreements of the erased cases only", async () => {
    await agree("case-1");
    await agree("case-2");

    erasePartnerShareConsentsForCases(["case-1"]);
    expect(await getPartnerShareConsentState("case-1")).toEqual({
      status: "none", agreedAt: null, withdrawnAt: null, fingerprintCount: 0,
    });
    expect(await getPartnerShareConsentState("case-2")).toMatchObject({ status: "agreed" });
    expect(partnerMemory().shareConsents).toHaveLength(1);

    erasePartnerShareConsentsForCases([]);
    expect(partnerMemory().shareConsents).toHaveLength(1);
  });
});

describe("partner-share consent, Prisma path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(false);
    mocks.prisma.templateFindFirst.mockReset().mockResolvedValue(template);
    mocks.prisma.consentFindMany.mockReset().mockResolvedValue([]);
    mocks.prisma.consentFindFirst.mockReset().mockResolvedValue(null);
    mocks.prisma.consentCreate.mockReset().mockResolvedValue({ id: "consent-1" });
    mocks.prisma.consentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.prisma.hashFindMany.mockReset().mockResolvedValue(hashRows);
  });

  it("requires a template reviewed by legal, unless the dev bypass is on (Rule 4)", async () => {
    await findPartnerSharingTemplate(false);
    expect(mocks.prisma.templateFindFirst.mock.calls[0][0]).toEqual({
      where: { templateType: "PARTNER_SHARING_CONSENT", isActive: true, reviewedByLegal: true },
      orderBy: { version: "desc" },
    });

    await findPartnerSharingTemplate(true);
    expect(mocks.prisma.templateFindFirst.mock.calls[1][0]).toEqual({
      where: { templateType: "PARTNER_SHARING_CONSENT", isActive: true },
      orderBy: { version: "desc" },
    });
  });

  it("builds the agreement from the reviewed template and the approved fingerprints only", async () => {
    const draft = await buildPartnerSharingDraft("case-1", "ASMITA-2026-00001", false);
    if ("error" in draft) throw new Error(`unexpected ${draft.error}`);
    expect(draft.template).toBe(template);
    expect(draft.hashSubmissionIds).toEqual(["hash-1", "hash-2"]);
    expect(draft.subject).toBe("Agreement to share my image fingerprints - ASMITA-2026-00001");
    expect(draft.body).toContain("AGREEMENT for ASMITA-2026-00001 (ASMITA-2026-00001)");
    expect(draft.body).toContain("--- PERCEPTUAL HASH ANNEX ---");
    expect(draft.body).toContain(HEX_A);
    expect(draft.body).toContain(HEX_B);
    // She agrees only to the text and fingerprints this reference pins.
    expect(draft.templateRef).toBe(templateRef(template, ["hash-1", "hash-2"]));

    // The template gate and the status filter are asked at the query (Rules 2 and 4).
    expect(mocks.prisma.templateFindFirst.mock.calls[0][0]).toEqual({
      where: { templateType: "PARTNER_SHARING_CONSENT", isActive: true, reviewedByLegal: true },
      orderBy: { version: "desc" },
    });
    expect(mocks.prisma.hashFindMany.mock.calls[0][0]).toMatchObject({
      where: { caseId: "case-1", status: { in: ["APPROVED", "DISPATCHED"] } },
      orderBy: { submittedAt: "asc" },
    });
  });

  it("refuses to build a draft without a template or without an approved fingerprint", async () => {
    mocks.prisma.templateFindFirst.mockResolvedValue(null);
    expect(await buildPartnerSharingDraft("case-1", "ASMITA-2026-00001", false)).toEqual({ error: "template_missing" });

    mocks.prisma.templateFindFirst.mockResolvedValue(template);
    mocks.prisma.hashFindMany.mockResolvedValue([]);
    expect(await buildPartnerSharingDraft("case-1", "ASMITA-2026-00001", false)).toEqual({ error: "no_hashes" });
    expect(mocks.prisma.hashFindMany).toHaveBeenCalledTimes(1);
  });

  it("records the tick with the pinned template and the fingerprint ids she saw", async () => {
    const agreedAt = new Date("2026-11-19T09:30:00.000Z");
    const result = await recordPartnerShareConsent({
      caseId: "case-1",
      hashSubmissionIds: ["hash-1", "hash-2"],
      templateId: template.id,
      templateDigest: templateDigest(template),
      agreedAt,
      actorId: "user-1",
    });
    expect(result).toEqual({ ok: true, consentId: "consent-1" });

    // One live agreement per case: the insert runs behind a live check.
    expect(mocks.prisma.consentFindFirst).toHaveBeenCalledWith({
      where: { caseId: "case-1", withdrawnAt: null },
      select: { id: true },
    });
    expect(mocks.prisma.consentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.consentCreate.mock.calls[0][0]).toEqual({
      data: {
        caseId: "case-1",
        hashSubmissionIds: ["hash-1", "hash-2"],
        templateId: template.id,
        templateDigest: templateDigest(template),
        agreedAt,
      },
      select: { id: true },
    });

    // Rule 6: the audit entry carries internal ids and counts only.
    expect(inMemoryAuditLog).toHaveLength(1);
    const [event] = inMemoryAuditLog;
    expect(event.eventType).toBe("PARTNER_SHARE_CONSENT_GIVEN");
    expect(event.entityType).toBe("Case");
    expect(event.entityId).toBe("case-1");
    expect(event.actorId).toBe("user-1");
    expect(Object.keys(event.data ?? {}).sort()).toEqual(["consentId", "fingerprintCount"]);
    expect(event.data).toEqual({ consentId: "consent-1", fingerprintCount: 2 });
    expect(JSON.stringify(event.data)).not.toContain(HEX_A);
  });

  it("refuses a second live agreement, including a lost insert race", async () => {
    mocks.prisma.consentFindFirst.mockResolvedValue({ id: "live-consent" });
    expect(await agree("case-1")).toEqual({ ok: false, error: "already_agreed" });
    expect(mocks.prisma.consentCreate).not.toHaveBeenCalled();
    expect(inMemoryAuditLog).toHaveLength(0);

    // The partial unique index caught a concurrent tick.
    mocks.prisma.consentFindFirst.mockResolvedValue(null);
    mocks.prisma.consentCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect(await agree("case-1")).toEqual({ ok: false, error: "already_agreed" });
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("withdraws only the live rows and audits the count", async () => {
    mocks.prisma.consentUpdateMany.mockResolvedValue({ count: 2 });
    expect(await withdrawPartnerShareConsent("case-1", "user-1")).toEqual({ ok: true, consentsWithdrawn: 2 });
    expect(mocks.prisma.consentUpdateMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date) },
    });
    expect(inMemoryAuditLog).toHaveLength(1);
    expect(inMemoryAuditLog[0].eventType).toBe("PARTNER_SHARE_CONSENT_WITHDRAWN");
    expect(inMemoryAuditLog[0].entityId).toBe("case-1");
    expect(inMemoryAuditLog[0].actorId).toBe("user-1");
    expect(inMemoryAuditLog[0].data).toEqual({ reason: "survivor", consentsWithdrawn: 2 });

    mocks.prisma.consentUpdateMany.mockResolvedValue({ count: 0 });
    expect(await withdrawPartnerShareConsent("case-1", "user-1")).toEqual({ ok: false, error: "not_agreed" });
    expect(inMemoryAuditLog).toHaveLength(1);
  });

  it("lists only fingerprints with a live agreement on an adult case (Rules 2 and 3)", async () => {
    mocks.prisma.hashFindMany.mockResolvedValue([
      { id: "hash-1", caseId: "case-1", algorithm: "PDQ", case: { referenceNumber: "ASMITA-2026-00001" } },
      { id: "hash-2", caseId: "case-2", algorithm: "VPDQ", case: { referenceNumber: "ASMITA-2026-00002" } },
    ]);
    const listed = await listPartnerShareableFingerprints();
    expect(listed).toEqual([
      { hashSubmissionId: "hash-1", caseId: "case-1", caseReference: "ASMITA-2026-00001", algorithm: "PDQ" },
      { hashSubmissionId: "hash-2", caseId: "case-2", caseReference: "ASMITA-2026-00002", algorithm: "VPDQ" },
    ]);
    // Rule 2 (live agreement) and Rule 3 (adult case) hold at the query,
    // not by filtering afterwards.
    expect(mocks.prisma.hashFindMany.mock.calls[0][0]).toEqual({
      where: {
        status: { in: ["APPROVED", "DISPATCHED"] },
        case: {
          partnerShareConsents: { some: { withdrawnAt: null } },
          user: { ageOver18: true },
        },
      },
      select: { id: true, caseId: true, algorithm: true, case: { select: { referenceNumber: true } } },
      orderBy: { submittedAt: "asc" },
    });
  });

  it("account deletion withdraws every live agreement with reason account_deletion", async () => {
    mocks.prisma.consentUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const withdrawn = await withdrawPartnerShareConsentsForDeletion(["case-1", "case-2"], "user-1");
    expect(withdrawn).toBe(1);
    expect(mocks.prisma.consentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: "case-1", withdrawnAt: null }, data: { withdrawnAt: expect.any(Date) } }),
    );
    expect(mocks.prisma.consentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: "case-2", withdrawnAt: null }, data: { withdrawnAt: expect.any(Date) } }),
    );
    expect(inMemoryAuditLog).toHaveLength(1);
    expect(inMemoryAuditLog[0].entityType).toBe("Case");
    expect(inMemoryAuditLog[0].entityId).toBe("case-1");
    expect(inMemoryAuditLog[0].actorId).toBe("user-1");
    expect(inMemoryAuditLog[0].data).toEqual({ reason: "account_deletion", consentsWithdrawn: 1 });
  });
});

describe("listPartnerShareableFingerprints, Kysely path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(true);
    mocks.kysely.state.rows = {};
    mocks.kysely.state.updateResults = {};
    mocks.kysely.state.calls.length = 0;
  });

  it("asks for live consents, then adult cases, then approved fingerprints (Rules 2 and 3)", async () => {
    mocks.kysely.state.rows.PartnerShareConsent = [
      { id: "consent-1", caseId: "case-1", withdrawnAt: null },
      { id: "consent-2", caseId: "case-2", withdrawnAt: null },
    ];
    // The fake does not project the select list, so each joined row carries
    // both the where columns (Case.id, User.ageOver18) and the keys the
    // composition maps (id, referenceNumber).
    mocks.kysely.state.rows.Case = [
      { "Case.id": "case-1", "Case.referenceNumber": "ASMITA-2026-00001", id: "case-1", referenceNumber: "ASMITA-2026-00001", "User.ageOver18": true },
      // Rule 3 at the query: a minor's case is filtered out by the join.
      { "Case.id": "case-2", "Case.referenceNumber": "ASMITA-2026-00002", id: "case-2", referenceNumber: "ASMITA-2026-00002", "User.ageOver18": false },
    ];
    mocks.kysely.state.rows.HashSubmission = [
      { id: "hash-1", caseId: "case-1", algorithm: "PDQ", status: "APPROVED" },
      { id: "hash-2", caseId: "case-1", algorithm: "VPDQ", status: "DISPATCHED" },
      { id: "hash-3", caseId: "case-1", algorithm: "PDQ", status: "PENDING_REVIEW" },
      { id: "hash-4", caseId: "case-1", algorithm: "PDQ", status: "REJECTED" },
      { id: "hash-5", caseId: "case-2", algorithm: "PDQ", status: "APPROVED" },
    ];

    const listed = await listPartnerShareableFingerprints();
    expect(listed).toEqual([
      { hashSubmissionId: "hash-1", caseId: "case-1", caseReference: "ASMITA-2026-00001", algorithm: "PDQ" },
      { hashSubmissionId: "hash-2", caseId: "case-1", caseReference: "ASMITA-2026-00001", algorithm: "VPDQ" },
    ]);

    // The query sequence: live consents first...
    const consents = callsOn("PartnerShareConsent");
    expect(consents).toHaveLength(1);
    expect(consents[0].detail.select).toBe("caseId");
    expect(consents[0].detail.wheres).toEqual([["withdrawnAt", "is", null]]);
    // ...then the adult cases, joined to User...
    const caseQuery = callsOn("Case");
    expect(caseQuery).toHaveLength(1);
    expect(caseQuery[0].detail.join).toBe("User");
    expect(caseQuery[0].detail.select).toEqual(["Case.id", "Case.referenceNumber"]);
    expect(caseQuery[0].detail.wheres).toEqual([
      ["Case.id", "in", ["case-1", "case-2"]],
      ["User.ageOver18", "=", true],
    ]);
    // ...then the approved fingerprints of those cases only.
    const hashQuery = callsOn("HashSubmission");
    expect(hashQuery).toHaveLength(1);
    expect(hashQuery[0].detail.select).toEqual(["id", "caseId", "algorithm"]);
    expect(hashQuery[0].detail.wheres).toEqual([
      ["caseId", "in", ["case-1"]],
      ["status", "in", ["APPROVED", "DISPATCHED"]],
    ]);
  });

  it("shares nothing without a live agreement, asking nothing else", async () => {
    mocks.kysely.state.rows.PartnerShareConsent = [];
    expect(await listPartnerShareableFingerprints()).toEqual([]);
    expect(callsOn("Case")).toHaveLength(0);
    expect(callsOn("HashSubmission")).toHaveLength(0);
  });
});
