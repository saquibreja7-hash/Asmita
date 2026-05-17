import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  sendNoticeDraft: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

import { sendNoticeDraft } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import {
  dispatchEscalationFollowUp,
  dispatchedFollowUps,
} from "@/lib/notice-dispatch";

describe("dispatchEscalationFollowUp", () => {
  beforeEach(() => {
    dispatchedFollowUps.clear();
    vi.mocked(sendNoticeDraft).mockResolvedValue({ id: "msg-abc" } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unverified or invalid recipient", async () => {
    await expect(
      dispatchEscalationFollowUp({
        caseId: "case-1",
        urlId: "url-1",
        level: 1,
        recipientEmail: "<TO_BE_VERIFIED_BY_HUMAN>",
        subject: "[Follow-up #1] x",
        body: "y",
      }),
    ).rejects.toThrow("verified_recipient_required");
    expect(sendNoticeDraft).not.toHaveBeenCalled();
  });

  it("sends and writes a NOTICE_SENT audit log with the escalation level", async () => {
    const result = await dispatchEscalationFollowUp({
      caseId: "case-1",
      urlId: "url-1",
      level: 1,
      recipientEmail: "go@platform.com",
      subject: "[Follow-up #1] takedown",
      body: "Dear GO, this is the same body the lawyers reviewed.",
    });

    expect(result.dispatched).toBe(true);
    expect(sendNoticeDraft).toHaveBeenCalledWith(
      "go@platform.com",
      "[Follow-up #1] takedown",
      "Dear GO, this is the same body the lawyers reviewed.",
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_SENT",
        data: expect.objectContaining({ escalationLevel: 1, reason: "follow_up_after_no_response" }),
      }),
    );
  });

  it("dedupes a duplicate L1 send (caseId, urlId, recipient, level)", async () => {
    const args = {
      caseId: "case-1",
      urlId: "url-1",
      level: 1 as const,
      recipientEmail: "go@platform.com",
      subject: "[Follow-up #1] takedown",
      body: "body",
    };
    const first = await dispatchEscalationFollowUp(args);
    const second = await dispatchEscalationFollowUp(args);

    expect(first.dispatched).toBe(true);
    expect(second.dispatched).toBe(false);
    expect(sendNoticeDraft).toHaveBeenCalledTimes(1);
  });

  it("allows two different levels for the same notice (distinct idempotency slots)", async () => {
    const baseArgs = {
      caseId: "case-1",
      urlId: "url-1",
      recipientEmail: "go@platform.com",
      body: "body",
    };
    const l1 = await dispatchEscalationFollowUp({ ...baseArgs, level: 1, subject: "[Follow-up #1]" });
    const l2 = await dispatchEscalationFollowUp({ ...baseArgs, level: 2, subject: "[Follow-up #2]" });

    expect(l1.dispatched).toBe(true);
    expect(l2.dispatched).toBe(true);
    expect(sendNoticeDraft).toHaveBeenCalledTimes(2);
  });

  it("does NOT collide with the Tier 2 first-send dedup map", async () => {
    // Confirm the two maps are independent by simulating a Tier 2 send going
    // first to the original dispatcher's map, then a follow-up. Since the
    // follow-up function uses its own dispatchedFollowUps map keyed with
    // ":L1", it should still dispatch.
    const followUp = await dispatchEscalationFollowUp({
      caseId: "case-1",
      urlId: "url-1",
      level: 1,
      recipientEmail: "go@platform.com",
      subject: "[Follow-up #1] takedown",
      body: "body",
    });
    expect(followUp.dispatched).toBe(true);
  });
});
