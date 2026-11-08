import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 0 of docs/product/admin-console-redesign.md: admin pages read real
// records and never show placeholder or estimated values.

vi.mock("@/lib/db", () => ({
  db: {
    noticeTemplate: { findMany: vi.fn() },
    notice: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), groupBy: vi.fn() },
    case: { findMany: vi.fn(), count: vi.fn() },
    emailDeliveryProof: { findMany: vi.fn() },
    feedback: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/case-ops", () => ({
  listAllCases: vi.fn(),
}));

import { db } from "@/lib/db";
import * as caseOps from "@/lib/case-ops";
import type { DisplayCase } from "@/lib/case-ops";
import { inMemoryAuditLog, writeAuditLog } from "@/lib/audit";
import {
  getInternalAnalytics,
  listAuditLogPage,
  listNgoVouchingRows,
  listNoticeTemplateRows,
  listPlatformResponseRows,
} from "@/lib/admin-dashboard";

const mocked = db as unknown as {
  noticeTemplate: { findMany: ReturnType<typeof vi.fn> };
  notice: { findMany: ReturnType<typeof vi.fn> };
  auditLog: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  case: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  emailDeliveryProof: { findMany: ReturnType<typeof vi.fn> };
};

const now = new Date("2026-11-08T12:00:00.000Z");

function link(id: string, status: string): DisplayCase["urls"][number] {
  return { id, domain: "youtube.com", platformName: "YouTube", status, urlHash: `hash-${id}`, platformId: "yt" };
}

function caseWith(id: string, urls: DisplayCase["urls"]): DisplayCase {
  return { id, referenceNumber: `ASMITA-2026-${id.toUpperCase()}`, userId: "user", createdAt: now.toISOString(), status: "OPEN", urls };
}
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("with a database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("lists templates from NoticeTemplate with their real review state", async () => {
    mocked.noticeTemplate.findMany.mockResolvedValue([
      {
        id: "t1",
        templateType: "IT_RULES_2021",
        subjectTemplate: "Statutory notice {{caseReference}}",
        version: 3,
        isActive: true,
        reviewedByLegal: false,
        reviewedAt: null,
        reviewedByName: null,
        platform: null,
      },
    ]);

    const rows = await listNoticeTemplateRows();

    expect(rows).toEqual([
      expect.objectContaining({ id: "t1", reviewedByLegal: false, isActive: true, platformName: null, version: 3 }),
    ]);
  });

  it("counts response rows from sent original notices, without inventing replies", async () => {
    vi.mocked(caseOps.listAllCases).mockResolvedValue([
      caseWith("c1", [link("u1", "NOTICE_SENT")]),
      caseWith("c2", [link("u2", "REMOVED")]),
    ]);
    mocked.notice.findMany.mockResolvedValue([
      {
        sentAt: hoursAgo(30),
        messageId: "m1",
        responseReceivedAt: hoursAgo(20),
        removedAt: null,
        urlId: "u1",
      },
      {
        sentAt: hoursAgo(10),
        messageId: "m2",
        responseReceivedAt: null,
        removedAt: null,
        urlId: "u2",
      },
    ]);

    const rows = await listPlatformResponseRows(now);

    expect(mocked.notice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { followUpOf: null, sentAt: { gte: hoursAgo(7 * 24) } } }),
    );
    expect(rows).toEqual([
      {
        platformId: "yt",
        platformName: "YouTube",
        noticesSent: 2,
        repliesRecorded: 1,
        removed: 1,
        noReplyRecorded: 1,
        medianReplyHours: 10,
      },
    ]);
  });

  it("reads NGO vouches from the stored audit log and resolves case references", async () => {
    mocked.auditLog.findMany.mockResolvedValue([
      { sequence: 42, entityId: "c1", data: { partnerName: "Partner NGO" }, createdAt: hoursAgo(1) },
    ]);
    mocked.case.findMany.mockResolvedValue([{ id: "c1", referenceNumber: "ASMITA-2026-ABCDEF" }]);

    const rows = await listNgoVouchingRows();

    expect(rows).toEqual([
      { partnerName: "Partner NGO", caseReference: "ASMITA-2026-ABCDEF", vouchedAt: hoursAgo(1).toISOString(), auditSequence: 42 },
    ]);
  });

  it("pages the stored audit log newest first by sequence", async () => {
    const records = [12, 11, 10].map((sequence) => ({
      sequence,
      eventType: "NOTICE_SENT",
      actorId: null,
      entityType: "Notice",
      entityId: `n${sequence}`,
      createdAt: hoursAgo(sequence),
      eventHash: "a".repeat(64),
    }));
    mocked.auditLog.findMany.mockResolvedValue(records);

    const page = await listAuditLogPage({ eventType: "notice_sent" }, { before: 13, limit: 2 });

    expect(mocked.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventType: "NOTICE_SENT", sequence: { lt: 13 } },
        orderBy: { sequence: "desc" },
        take: 3,
      }),
    );
    expect(page.rows.map((row) => row.sequence)).toEqual([12, 11]);
    expect(page.rows[0]).toMatchObject({ actorId: "system", eventHash: "a".repeat(16) });
    expect(page.nextBefore).toBe(11);
  });

  it("returns an empty page for an event type that cannot exist, without querying", async () => {
    const page = await listAuditLogPage({ eventType: "drop table" });

    expect(page).toEqual({ rows: [], nextBefore: null });
    expect(mocked.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("builds analytics from measured notice times only", async () => {
    vi.mocked(caseOps.listAllCases).mockResolvedValue([
      { ...caseWith("c1", [link("u1", "NOTICE_SENT")]), createdAt: hoursAgo(50).toISOString() },
    ]);
    mocked.notice.findMany.mockResolvedValue([
      {
        sentAt: hoursAgo(48),
        messageId: "m1",
        responseReceivedAt: null,
        removedAt: null,
        urlId: "u1",
      },
    ]);
    mocked.auditLog.groupBy.mockResolvedValue([{ eventType: "NOTICE_SENT", _count: { _all: 1 } }]);
    mocked.emailDeliveryProof.findMany.mockImplementation(({ where }: { where: { messageId?: unknown } }) =>
      Promise.resolve(where.messageId ? [{ messageId: "m1" }] : []),
    );
    mocked.case.count.mockResolvedValue(0);

    const analytics = await getInternalAnalytics(now);

    expect(analytics.repliesRecorded).toBe(false);
    expect(analytics.betaMetrics.noticesSent).toBe(1);
    expect(analytics.betaMetrics.noticeDeliverySuccessRate).toBe(1);
    expect(analytics.betaMetrics.acknowledgmentRate).toBe(0);
    expect(analytics.betaMetrics.medianRegistrationToNoticeHours).toBe(2);
    expect(analytics.auditEventCounts).toEqual([{ eventType: "NOTICE_SENT", count: 1 }]);
  });
});

describe("without a database (local development)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    inMemoryAuditLog.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    inMemoryAuditLog.length = 0;
  });

  it("shows no templates rather than placeholder rows", async () => {
    expect(await listNoticeTemplateRows()).toEqual([]);
  });

  it("shows no response rows rather than sample platforms", async () => {
    expect(await listPlatformResponseRows(now)).toEqual([]);
  });

  it("pages the in-memory audit log with the same filters", async () => {
    await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: "c1" });
    await writeAuditLog({ eventType: "URL_SUBMITTED", entityType: "SubmittedUrl", entityId: "u1" });
    await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: "c2" });

    const page = await listAuditLogPage({ eventType: "CASE_CREATED" }, { limit: 1 });
    expect(page.rows.map((row) => row.entityId)).toEqual(["c2"]);

    const older = await listAuditLogPage({ eventType: "CASE_CREATED" }, { before: page.nextBefore!, limit: 1 });
    expect(older.rows.map((row) => row.entityId)).toEqual(["c1"]);
    expect(older.nextBefore).toBeNull();
    expect(mocked.auditLog.findMany).not.toHaveBeenCalled();
  });
});
