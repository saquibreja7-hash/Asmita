import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    case: { findMany: vi.fn(), findUnique: vi.fn() },
    submittedUrl: { findMany: vi.fn() },
    notice: { findMany: vi.fn() },
    hashSubmission: { groupBy: vi.fn(), findMany: vi.fn() },
    platform: { findMany: vi.fn() },
    noticeTemplate: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  deriveCaseWork,
  getAdminCaseDetail,
  listAdminCases,
  listFlaggedLinks,
  summariseQueues,
  type CaseFacts,
  type Gates,
  type LinkFact,
  type PlatformFact,
} from "@/lib/admin-cases";

type Mock = ReturnType<typeof vi.fn>;
const mocked = db as unknown as Record<string, Record<string, Mock>>;

const now = new Date("2026-11-09T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

const youtube: PlatformFact = {
  id: "yt",
  name: "YouTube",
  noticeBasis: "IT_RULES_2021",
  emailReady: true,
  grievanceEmail: "grievance@youtube.test",
  lastContactVerifiedAt: hoursAgo(100),
};
const meta: PlatformFact = { ...youtube, id: "meta", name: "Meta", noticeBasis: "FORM_ONLY", emailReady: false };
const unverified: PlatformFact = { ...youtube, id: "x", name: "X", emailReady: false };

function gates(reviewed = true): Gates {
  return {
    platforms: new Map([youtube, meta, unverified].map((platform) => [platform.id, platform])),
    hasReviewedTemplate: () => reviewed,
  };
}

function link(overrides: Partial<LinkFact> = {}): LinkFact {
  return {
    id: "l1",
    status: "NOTICE_QUEUED",
    flaggedForReview: false,
    submittedAt: hoursAgo(10),
    platformId: "yt",
    platformFiledAt: null,
    signed: false,
    ...overrides,
  };
}

function facts(overrides: Partial<CaseFacts> = {}): CaseFacts {
  return {
    id: "c1",
    referenceNumber: "ASMITA-2026-AAAAAA",
    status: "OPEN",
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(1),
    declarationSignedAt: null,
    links: [],
    notices: [],
    pendingFingerprints: 0,
    oldestPendingFingerprint: null,
    ...overrides,
  };
}

describe("deriveCaseWork", () => {
  it("puts link review first, due four hours after the oldest flagged link", () => {
    const work = deriveCaseWork(
      facts({
        links: [
          link({ id: "a", status: "PENDING_REVIEW", submittedAt: hoursAgo(5) }),
          link({ id: "b", status: "PENDING_REVIEW", submittedAt: hoursAgo(1) }),
          link({ id: "c", signed: true }),
        ],
        pendingFingerprints: 2,
      }),
      gates(),
      now,
    );
    expect(work.nextAction).toBe("review_links");
    expect(work.actionCount).toBe(2);
    expect(work.dueAt).toEqual(hoursAgo(1));
  });

  it("asks to send a signed, approved notice to a verified platform", () => {
    const work = deriveCaseWork(
      facts({ declarationSignedAt: hoursAgo(2), links: [link({ signed: true })] }),
      gates(),
      now,
    );
    expect(work).toMatchObject({ nextAction: "send_notice", actionCount: 1, dueAt: hoursFromNow(2) });
  });

  it("waits on the survivor before signing and for form-only platforms", () => {
    expect(deriveCaseWork(facts({ links: [link()] }), gates(), now).nextAction).toBe("waiting_on_survivor");
    expect(
      deriveCaseWork(facts({ links: [link({ platformId: "meta", signed: true })] }), gates(), now).nextAction,
    ).toBe("waiting_on_survivor");
  });

  it("reports the gate that blocks a signed notice", () => {
    expect(
      deriveCaseWork(facts({ links: [link({ platformId: "x", signed: true })] }), gates(), now).nextAction,
    ).toBe("blocked_contact");
    expect(deriveCaseWork(facts({ links: [link({ signed: true })] }), gates(false), now).nextAction).toBe(
      "blocked_legal_review",
    );
  });

  it("tracks a sent notice against the platform deadline and the ladder", () => {
    const work = deriveCaseWork(
      facts({
        links: [link({ status: "NOTICE_SENT", signed: true })],
        notices: [{ urlId: "l1", sentAt: hoursAgo(30), responseType: null, responseReceivedAt: null, removedAt: null }],
      }),
      gates(),
      now,
    );
    expect(work.nextAction).toBe("awaiting_reply");
    expect(work.dueAt).toEqual(hoursAgo(6));
    expect(work.ladderStep).toBe(3);
  });

  it("starts the ladder for a form-only link when the survivor filed the form", () => {
    const work = deriveCaseWork(
      facts({ links: [link({ platformId: "meta", platformFiledAt: hoursAgo(1) })] }),
      gates(),
      now,
    );
    expect(work.nextAction).toBe("awaiting_reply");
    expect(work.ladderStep).toBe(1);
  });

  it("reports a refused escalation step ahead of waiting for the reply", () => {
    const work = deriveCaseWork(
      facts({
        links: [link({ status: "NOTICE_SENT", signed: true })],
        notices: [
          {
            urlId: "l1",
            sentAt: hoursAgo(30),
            responseType: null,
            responseReceivedAt: null,
            removedAt: null,
            ladderBlock: "template_not_legal_reviewed",
          },
        ],
      }),
      gates(),
      now,
    );
    expect(work.nextAction).toBe("blocked_escalation");
  });

  it("has nothing to do once every link is removed or rejected", () => {
    const work = deriveCaseWork(
      facts({
        links: [link({ id: "a", status: "REMOVED" }), link({ id: "b", status: "REJECTED", flaggedForReview: true })],
        notices: [{ urlId: "a", sentAt: hoursAgo(30), responseType: null, responseReceivedAt: null, removedAt: null }],
      }),
      gates(),
      now,
    );
    expect(work).toMatchObject({ nextAction: "none", allRemoved: true, dueAt: null });
  });
});

describe("listAdminCases", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    mocked.platform.findMany.mockResolvedValue([
      {
        id: "yt",
        name: "YouTube",
        noticeBasis: "IT_RULES_2021",
        grievanceEmail: "grievance@youtube.test",
        lastContactVerifiedByHuman: true,
        lastContactVerifiedAt: hoursAgo(100),
        isActive: true,
      },
    ]);
    mocked.noticeTemplate.findMany.mockResolvedValue([{ templateType: "IT_RULES_2021", platformId: null }]);
    mocked.notice.findMany.mockResolvedValue([]);
    mocked.hashSubmission.groupBy.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function seed(count: number) {
    const cases = Array.from({ length: count }, (_, index) => ({
      id: `c${index}`,
      referenceNumber: `ASMITA-2026-CASE${index}`,
      status: "OPEN",
      createdAt: hoursAgo(count - index),
      updatedAt: hoursAgo(1),
      declarationSignedAt: null,
    }));
    mocked.case.findMany.mockResolvedValue(cases);
    mocked.submittedUrl.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.signedNoticePdf
          ? []
          : cases.map((record, index) => ({
              id: `l${index}`,
              caseId: record.id,
              status: "PENDING_REVIEW",
              flaggedForReview: true,
              submittedAt: record.createdAt,
              platformId: "yt",
              platformFiledAt: null,
            })),
      ),
    );
  }

  it("sorts by due time and pages with a cursor that survives rows leaving", async () => {
    seed(5);
    const first = await listAdminCases({}, { limit: 2, now });
    expect(first.rows.map((row) => row.caseId)).toEqual(["c0", "c1"]);
    expect(first).toMatchObject({ total: 5, start: 1 });

    // c1 is acted on and leaves the list before the next page loads.
    const next = await listAdminCases({}, { limit: 2, cursor: first.nextCursor!, now });
    expect(next.rows.map((row) => row.caseId)).toEqual(["c2", "c3"]);
    expect(next.start).toBe(3);

    const last = await listAdminCases({}, { limit: 2, cursor: next.nextCursor!, now });
    expect(last.rows.map((row) => row.caseId)).toEqual(["c4"]);
    expect(last.nextCursor).toBeNull();
  });

  it("pushes status, date and reference filters to the database", async () => {
    seed(1);
    await listAdminCases({ statuses: ["OPEN", "BOGUS"], from: "2026-11-01", to: "2026-11-08", q: " sqwgcd " }, { now });
    expect(mocked.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["OPEN"] },
          createdAt: { gte: new Date("2026-11-01"), lt: new Date("2026-11-09") },
          referenceNumber: { endsWith: "SQWGCD" },
        },
      }),
    );
  });

  it("filters by next action and platform", async () => {
    seed(3);
    expect((await listAdminCases({ nextAction: "send_notice" }, { now })).total).toBe(0);
    expect((await listAdminCases({ nextAction: "review_links", platformId: "yt" }, { now })).total).toBe(3);
    expect((await listAdminCases({ platformId: "other" }, { now })).total).toBe(0);
  });

  it("ignores a cursor it cannot read", async () => {
    seed(2);
    const page = await listAdminCases({}, { cursor: "not-a-cursor", now });
    expect(page.rows).toHaveLength(2);
  });

  it("never selects the encrypted link or the signed PDF", async () => {
    seed(1);
    await listAdminCases({}, { now });
    for (const [args] of mocked.submittedUrl.findMany.mock.calls) {
      expect(args.select).not.toHaveProperty("urlEncrypted");
      expect(args.select).not.toHaveProperty("signedNoticePdf");
      expect(args.select).not.toHaveProperty("urlHash");
    }
  });
});

describe("getAdminCaseDetail", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function mockSignedYoutubeCase() {
      mocked.case.findUnique.mockResolvedValue({
        id: "c1",
        referenceNumber: "ASMITA-2026-AAAAAA",
        status: "OPEN",
        createdAt: hoursAgo(12),
        updatedAt: hoursAgo(1),
        declarationSignedAt: hoursAgo(2),
        ngoVerified: false,
        hashAdvisorySignedHashIds: [],
      });
      mocked.platform.findMany.mockResolvedValue([
        {
          id: "yt",
          name: "YouTube",
          noticeBasis: "IT_RULES_2021",
          grievanceEmail: "grievance@youtube.test",
          lastContactVerifiedByHuman: true,
          lastContactVerifiedAt: hoursAgo(100),
          isActive: true,
        },
      ]);
      mocked.noticeTemplate.findMany.mockResolvedValue([{ templateType: "IT_RULES_2021", platformId: null }]);
      mocked.noticeTemplate.findFirst.mockResolvedValue({
        templateType: "IT_RULES_2021",
        version: 3,
        reviewedAt: hoursAgo(48),
        reviewedByName: "Legal Reviewer",
      });
      mocked.submittedUrl.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          where.signedNoticePdf
            ? [{ id: "l1" }]
            : [
                {
                  id: "l1",
                  domain: "youtube.com",
                  status: "NOTICE_QUEUED",
                  flaggedForReview: false,
                  flagReason: null,
                  submittedAt: hoursAgo(10),
                  platformId: "yt",
                  platformFiledAt: null,
                  signedHashSubmissionIds: ["h1"],
                },
              ],
        ),
      );
      mocked.notice.findMany.mockResolvedValue([]);
      mocked.hashSubmission.findMany.mockResolvedValue([
        {
          id: "h1",
          status: "APPROVED",
          quality: 90,
          hashDigest: "f".repeat(64),
          submittedAt: hoursAgo(9),
          flagReason: null,
          requestedPlatform: null,
        },
      ]);
      mocked.auditLog.findMany.mockResolvedValue([]);
  }

  it("returns null for an unknown reference", async () => {
    mocked.case.findUnique.mockResolvedValue(null);
    expect(await getAdminCaseDetail("asmita-2026-nope00", now)).toBeNull();
    expect(mocked.case.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { referenceNumber: "ASMITA-2026-NOPE00" } }),
    );
  });

  it("offers Send notice with the template dispatch would use, without loading link content", async () => {
    mockSignedYoutubeCase();

    const detail = await getAdminCaseDetail("ASMITA-2026-AAAAAA", now);

    expect(detail?.work.nextAction).toBe("send_notice");
    expect(detail?.links[0]).toMatchObject({
      signed: true,
      retained: true,
      signedFingerprintIds: ["h1"],
      dispatch: { recipient: "grievance@youtube.test", templateType: "IT_RULES_2021", templateVersion: 3 },
    });
    expect(detail?.fingerprints[0]).toMatchObject({ digestPrefix: "f".repeat(12), inSignedNotice: true });
    for (const [args] of mocked.submittedUrl.findMany.mock.calls) {
      expect(args.select).not.toHaveProperty("urlEncrypted");
      expect(args.select).not.toHaveProperty("signedNoticePdf");
    }
    expect(mocked.hashSubmission.findMany.mock.calls[0][0].select).not.toHaveProperty("hashEncrypted");
  });

  it("does not offer Send notice again once the notice went out", async () => {
    mockSignedYoutubeCase();
    mocked.notice.findMany.mockResolvedValue([
      {
        id: "n1",
        urlId: "l1",
        sentAt: hoursAgo(1),
        escalationLevel: 0,
        followUpOf: null,
        responseType: null,
        responseReceivedAt: null,
        removedAt: null,
      },
    ]);

    const detail = await getAdminCaseDetail("ASMITA-2026-AAAAAA", now);

    expect(detail?.work.nextAction).toBe("awaiting_reply");
    expect(detail?.links[0]).toMatchObject({ noticeSent: true, dispatch: null, ladderStep: 1 });
  });
});

describe("escalation blocks, queue summary and flagged links", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    mocked.platform.findMany.mockResolvedValue([
      {
        id: "yt",
        name: "YouTube",
        noticeBasis: "IT_RULES_2021",
        grievanceEmail: "grievance@youtube.test",
        lastContactVerifiedByHuman: true,
        lastContactVerifiedAt: hoursAgo(100),
        isActive: true,
      },
    ]);
    mocked.noticeTemplate.findMany.mockResolvedValue([{ templateType: "IT_RULES_2021", platformId: null }]);
    mocked.hashSubmission.groupBy.mockResolvedValue([]);
    mocked.case.findMany.mockResolvedValue(
      ["c1", "c2", "c3"].map((id, index) => ({
        id,
        referenceNumber: `ASMITA-2026-${id.toUpperCase()}`,
        status: "OPEN",
        createdAt: hoursAgo(40 - index),
        updatedAt: hoursAgo(1),
        declarationSignedAt: hoursAgo(39),
      })),
    );
    mocked.submittedUrl.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.signedNoticePdf
          ? [{ id: "l1" }, { id: "l2" }, { id: "l3" }]
          : ["1", "2", "3"].map((n) => ({
              id: `l${n}`,
              caseId: `c${n}`,
              status: "NOTICE_QUEUED",
              flaggedForReview: false,
              submittedAt: hoursAgo(40),
              platformId: "yt",
              platformFiledAt: null,
            })),
      ),
    );
    mocked.notice.findMany.mockResolvedValue(
      ["1", "2"].map((n) => ({
        id: `n${n}`,
        urlId: `l${n}`,
        sentAt: hoursAgo(30),
        escalationLevel: n === "1" ? 0 : 1,
        responseType: null,
        responseReceivedAt: null,
        removedAt: null,
      })),
    );
    // n1's L1 is refused now; n2's old L1 refusal was later sent (level 1 reached).
    mocked.auditLog.findMany.mockResolvedValue([
      { entityId: "n1", data: { reason: "template_not_legal_reviewed", escalationLevel: 1 } },
      { entityId: "n2", data: { reason: "no_verified_recipient", escalationLevel: 1 } },
    ]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("treats a refusal as current only while its level is above the level reached", async () => {
    const page = await listAdminCases({}, { now });
    const byCase = new Map(page.rows.map((row) => [row.caseId, row.nextAction]));
    expect(byCase.get("c1")).toBe("blocked_escalation");
    expect(byCase.get("c2")).toBe("awaiting_reply");
    expect(byCase.get("c3")).toBe("send_notice");
    expect(mocked.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventType: "NOTICE_FAILED", entityType: "Notice", entityId: { in: ["n1", "n2"] } },
      }),
    );
    expect((await listAdminCases({ nextAction: "blocked" }, { now })).rows.map((row) => row.caseId)).toEqual(["c1"]);
  });

  it("counts open cases per queue and lists operator work first", async () => {
    const summary = await summariseQueues(now);
    const count = (kind: string) => summary.queues.find((queue) => queue.kind === kind)?.count;
    expect(count("blocked_escalation")).toBe(1);
    expect(count("awaiting_reply")).toBe(1);
    expect(count("send_notice")).toBe(1);
    expect(summary.queues.find((queue) => queue.kind === "send_notice")?.overdue).toBe(1);
    // Awaiting a platform is not operator work.
    expect(summary.actionable).toBe(2);
    expect(summary.dueNext.map((row) => row.caseId).sort()).toEqual(["c1", "c3"]);
    expect(mocked.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["OPEN", "PARTIALLY_RESOLVED", "ESCALATED"] } } }),
    );
  });

  it("lists flagged links without loading link content", async () => {
    mocked.submittedUrl.findMany.mockResolvedValue([
      {
        id: "l9",
        domain: "unknown-site.example",
        status: "PENDING_REVIEW",
        flagReason: null,
        platform: null,
        case: { id: "c9", referenceNumber: "ASMITA-2026-FLAGGD", createdAt: hoursAgo(5) },
      },
    ]);
    const rows = await listFlaggedLinks(now);
    expect(rows).toEqual([
      expect.objectContaining({
        urlId: "l9",
        referenceNumber: "ASMITA-2026-FLAGGD",
        investigationOnly: true,
        slaState: "breached",
        platformName: "Unknown platform",
      }),
    ]);
    const [args] = mocked.submittedUrl.findMany.mock.calls[0];
    expect(args.select).not.toHaveProperty("urlEncrypted");
    expect(args.select).not.toHaveProperty("signedNoticePdf");
  });
});
