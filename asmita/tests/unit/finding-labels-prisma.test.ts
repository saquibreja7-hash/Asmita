import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Review labels (review labels WP37) on the Prisma path, against a mocked
// client, plus the two server-side "possible minor" blocks that live on this
// path: the review route's planner and the representative-notice gate. The
// audit entries go to the in-memory log, so only @/lib/db is mocked.
// Placeholder data only.

const db = vi.hoisted(() => ({
  crawlFinding: { findUnique: vi.fn(), updateMany: vi.fn() },
  submittedUrl: { findFirst: vi.fn() },
}));

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { inMemoryAuditLog } from "@/lib/audit";
import { applyFindingLabel, reviewCrawlFinding } from "@/lib/crawl-findings";
import { previewRepresentativeNotice } from "@/lib/crawl-notice";

const NOW = new Date("2026-11-19T09:30:00.000Z");

function findingRow(over: Record<string, unknown> = {}) {
  return {
    id: "cf1", caseId: "c1", hashSubmissionId: "h1", crawlConsentId: "consent-1", distance: 6,
    reviewStatus: "CANDIDATE", reviewedById: null, firstSeenAt: new Date("2026-11-01T00:00:00Z"),
    pageUrlEncrypted: "enc-page", imageUrlEncrypted: "enc-image", urlDigest: "digest",
    labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
    labelSexual: false, labelSexualById: null, labelSexualAt: null,
    labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
    labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
    minorProtocolBefore: null,
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  db.crawlFinding.findUnique.mockResolvedValue(findingRow());
  db.crawlFinding.updateMany.mockResolvedValue({ count: 1 });
  db.submittedUrl.findFirst.mockResolvedValue(null);
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("applyFindingLabel, Prisma path", () => {
  it("writes an informational label in one conditional updateMany", async () => {
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "sexual", adminId: "admin-1", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: true });
    expect(db.crawlFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "cf1", labelSexual: false },
      data: { labelSexual: true, labelSexualById: "admin-1", labelSexualAt: NOW },
    });
    expect(inMemoryAuditLog.at(-1)).toMatchObject({
      eventType: "CRAWL_FINDING_LABEL_SET", entityId: "cf1", actorId: "admin-1", data: { caseId: "c1", label: "sexual" },
    });
  });

  it("moves an approved finding into MINOR_PROTOCOL, conditional on the status it planned from", async () => {
    db.crawlFinding.findUnique.mockResolvedValue(findingRow({ reviewStatus: "APPROVED" }));
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: true });
    expect(db.crawlFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "cf1", labelPossibleMinor: false, reviewStatus: "APPROVED" },
      data: expect.objectContaining({
        labelPossibleMinor: true, labelPossibleMinorById: "admin-1", labelPossibleMinorAt: NOW,
        minorProtocolBefore: "APPROVED", reviewStatus: "MINOR_PROTOCOL",
      }),
    });
  });

  it("clears the possible-minor label with the second admin's reason and restores the status", async () => {
    db.crawlFinding.findUnique.mockResolvedValue(findingRow({
      reviewStatus: "MINOR_PROTOCOL", minorProtocolBefore: "CANDIDATE",
      labelPossibleMinor: true, labelPossibleMinorById: "admin-1", labelPossibleMinorAt: NOW,
    }));
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "clear", label: "possibleMinor", adminId: "admin-2", reason: "checked the case file", now: NOW });
    expect(outcome).toEqual({ ok: true, changed: true });
    expect(db.crawlFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "cf1", labelPossibleMinor: true, reviewStatus: "MINOR_PROTOCOL" },
      data: expect.objectContaining({
        labelPossibleMinor: false, labelPossibleMinorClearedById: "admin-2", labelPossibleMinorClearedAt: NOW,
        labelPossibleMinorClearReason: "checked the case file", reviewStatus: "CANDIDATE",
      }),
    });
    expect(inMemoryAuditLog.at(-1)).toMatchObject({
      eventType: "CRAWL_FINDING_LABEL_CLEARED", actorId: "admin-2",
      data: { caseId: "c1", label: "possibleMinor", reason: "checked the case file", restoredTo: "CANDIDATE" },
    });
  });

  it("reports a conflict and audits nothing when the conditional write loses the row", async () => {
    db.crawlFinding.updateMany.mockResolvedValue({ count: 0 });
    const outcome = await applyFindingLabel({ findingId: "cf1", action: "set", label: "aiMade", adminId: "admin-1", now: NOW });
    expect(outcome).toEqual({ ok: false, error: "label_conflict" });
    expect(inMemoryAuditLog).toHaveLength(0);
  });
});

describe("possible minor blocks the adult flow on the Prisma path", () => {
  it("reviewCrawlFinding refuses to approve or dismiss a labelled finding", async () => {
    db.crawlFinding.findUnique.mockResolvedValue(findingRow({ labelPossibleMinor: true }));
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-2" })).toEqual({ ok: false, error: "minor_protocol_active" });
    expect(await reviewCrawlFinding({ findingId: "cf1", decision: "dismiss", reviewerId: "admin-2" })).toEqual({ ok: false, error: "minor_protocol_active" });
    expect(db.crawlFinding.updateMany).not.toHaveBeenCalled();
  });

  it("the representative notice refuses while the label is set, whatever the review status", async () => {
    // Approved, eligible in every other way — the label alone stops it. The
    // pinned now keeps the fixture inside its 30-day retention.
    const NOW = new Date("2026-11-19T12:00:00.000Z");
    db.crawlFinding.findUnique.mockResolvedValue(findingRow({ reviewStatus: "APPROVED", labelPossibleMinor: true }));
    expect(await previewRepresentativeNotice({ findingId: "cf1", caseId: "c1", adminId: "admin-2", now: NOW }))
      .toMatchObject({ ok: false, status: 409, error: "possible_minor_label_set" });
    // And the block is gone once the label is cleared: the notice path runs
    // on and fails on the next gate (no crawler link for this finding), not
    // on the label.
    db.crawlFinding.findUnique.mockResolvedValue(findingRow({ reviewStatus: "APPROVED" }));
    const next = await previewRepresentativeNotice({ findingId: "cf1", caseId: "c1", adminId: "admin-2", now: NOW });
    expect(next).toMatchObject({ ok: false, error: "crawler_link_not_found" });
  });
});
