import { beforeEach, describe, expect, it, vi } from "vitest";

// The survivor is told when a signature they gave was voided and is waiting
// for them to sign again: from the void's audit entry, until they re-sign.

const mocks = vi.hoisted(() => ({ trail: vi.fn(), urlFindMany: vi.fn(), caseCount: vi.fn() }));
vi.mock("@/lib/audit", () => ({ readAuditTrail: mocks.trail }));
vi.mock("@/lib/db", () => ({
  db: { submittedUrl: { findMany: mocks.urlFindMany }, case: { count: mocks.caseCount } },
}));

import { findVoidedSignatures } from "@/lib/voided-signatures";

const voidEvent = (data: Record<string, unknown>) => ({
  eventType: "ADMIN_ACTION",
  entityId: "case-1",
  sequence: 1,
  createdAt: new Date().toISOString(),
  previousHash: "",
  eventHash: "",
  data: { action: "signatures_voided", ...data },
});

describe("findVoidedSignatures", () => {
  beforeEach(() => {
    mocks.trail.mockReset().mockResolvedValue([]);
    mocks.urlFindMany.mockReset().mockResolvedValue([]);
    mocks.caseCount.mockReset().mockResolvedValue(0);
  });

  it("finds nothing, without querying links, when nothing was ever voided", async () => {
    mocks.trail.mockResolvedValue([{ ...voidEvent({}), eventType: "NOTICE_SIGNED", data: { type: "HASH_ADVISORY" } }]);
    expect(await findVoidedSignatures("case-1")).toEqual({ urlIds: [], hashAdvisory: false });
    expect(mocks.urlFindMany).not.toHaveBeenCalled();
  });

  it("lists voided links that are still unsigned and unsent, from every kind of void", async () => {
    mocks.trail.mockResolvedValue([
      voidEvent({ trigger: "rejection", urlIds: ["url-1"], hashAdvisory: false }),
      voidEvent({ trigger: "template_changed", urlIds: ["url-2"], hashAdvisory: false }),
      voidEvent({ trigger: "admin", reason: "other", urlIds: ["url-3"], hashAdvisory: false }),
    ]);
    // url-2 was signed again since: only the others are still waiting.
    mocks.urlFindMany.mockResolvedValue([{ id: "url-1" }, { id: "url-3" }]);

    expect(await findVoidedSignatures("case-1")).toEqual({ urlIds: ["url-1", "url-3"], hashAdvisory: false });
    const [args] = mocks.urlFindMany.mock.calls[0];
    expect(args.where).toMatchObject({
      caseId: "case-1",
      id: { in: ["url-1", "url-2", "url-3"] },
      signedNoticePdf: null,
      notices: { none: {} },
    });
  });

  it("reports a voided hash advisory until it is signed again", async () => {
    mocks.trail.mockResolvedValue([voidEvent({ trigger: "dispatch", urlIds: [], hashAdvisory: true })]);
    mocks.caseCount.mockResolvedValue(1);
    expect(await findVoidedSignatures("case-1")).toEqual({ urlIds: [], hashAdvisory: true });
    expect(mocks.caseCount).toHaveBeenCalledWith({ where: { id: "case-1", signedHashAdvisoryPdf: null } });

    mocks.caseCount.mockResolvedValue(0);
    expect((await findVoidedSignatures("case-1")).hashAdvisory).toBe(false);
  });

  it("shows nothing rather than breaking the page when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.trail.mockRejectedValue(new Error("database down"));
    expect(await findVoidedSignatures("case-1")).toEqual({ urlIds: [], hashAdvisory: false });
  });
});
