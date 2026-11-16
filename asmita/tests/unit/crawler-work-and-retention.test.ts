import { describe, expect, it, vi } from "vitest";

// Admin work items for crawler links, and URL retention blanking the
// representative notice PDF (it names the page and image addresses).

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({
      submittedUrl: { findMany: mocks.findMany, updateMany: mocks.updateMany },
      urlPortalToken: { deleteMany: mocks.deleteMany },
    }),
  },
}));

import { deriveCaseWork, type CaseFacts, type Gates, type LinkFact } from "@/lib/admin-cases";
import { purgeExpiredUrls } from "@/lib/url-retention";

const now = new Date("2026-11-16T12:00:00Z");
const gates: Gates = {
  platforms: new Map([["yt", { id: "yt", name: "Example", noticeBasis: "IT_RULES_2021", emailReady: true, apiReady: false, grievanceEmail: "g@example.org", lastContactVerifiedAt: now }]]),
  hasReviewedTemplate: () => true,
};
const link = (o: Partial<LinkFact> = {}): LinkFact => ({
  id: "l1", status: "NOTICE_QUEUED", flaggedForReview: false, submittedAt: now, platformId: "yt", platformFiledAt: null, signed: false, source: "CRAWLER", ...o,
});
const facts = (o: Partial<CaseFacts> = {}): CaseFacts => ({
  id: "c1", referenceNumber: "ASMITA-2026-AAAAAA", status: "OPEN", createdAt: now, updatedAt: now, declarationSignedAt: null,
  links: [], notices: [], pendingFingerprints: 0, oldestPendingFingerprint: null, ...o,
});

describe("admin work for crawler links", () => {
  it("an unsent crawler link is Asmita's to send, never waiting on the survivor", () => {
    expect(deriveCaseWork(facts({ links: [link()] }), gates, now).nextAction).toBe("send_notice");
    expect(deriveCaseWork(facts({ links: [link({ source: "SURVIVOR" })] }), gates, now).nextAction).toBe("waiting_on_survivor");
  });

  it("a withdrawn crawler link needs nothing, even one still pending review", () => {
    for (const status of ["NOTICE_QUEUED", "PENDING_REVIEW"]) {
      expect(deriveCaseWork(facts({ links: [link({ status, crawlConsentWithdrawn: true })] }), gates, now).nextAction).toBe("none");
    }
  });

  it("a sent representative notice awaits a reply with no ladder deadline", () => {
    const work = deriveCaseWork(facts({
      links: [link({ status: "NOTICE_SENT" })],
      notices: [{ urlId: "l1", sentAt: new Date(now.getTime() - 72 * 3_600_000), responseType: null, responseReceivedAt: null, removedAt: null }],
    }), gates, now);
    expect(work).toMatchObject({ nextAction: "awaiting_reply", dueAt: null, ladderStep: null });
  });
});

describe("URL retention", () => {
  it("blanks the representative notice PDF with the link, keeping its ids and digest", async () => {
    mocks.findMany.mockResolvedValue([{ id: "expired" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await purgeExpiredUrls(now);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["expired"] }, representativeNoticePdf: { not: null } },
      data: { representativeNoticePdf: null },
    });
  });
});
