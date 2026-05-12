import { afterEach, describe, expect, it } from "vitest";
import { assertVerifiedNoticeRecipient, dispatchedNotices, dispatchTier2Notice } from "@/lib/notice-dispatch";
import { HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";

describe("dispatchTier2Notice", () => {
  afterEach(() => dispatchedNotices.clear());

  it("uses an idempotency key to avoid duplicate sends", async () => {
    const input = {
      caseId: "case-1",
      urlId: "url-1",
      recipientEmail: "verified@example.com",
      subject: "PENDING REVIEW",
      body: "Draft notice body",
    };
    const first = await dispatchTier2Notice(input);
    const second = await dispatchTier2Notice(input);
    expect(first.dispatched).toBe(true);
    expect(second.dispatched).toBe(false);
    expect(first.notice.idempotencyKey).toBe(second.notice.idempotencyKey);
  });

  it("blocks placeholder or invalid recipients", () => {
    expect(() => assertVerifiedNoticeRecipient(HUMAN_VERIFICATION_REQUIRED)).toThrow("verified_recipient_required");
    expect(() => assertVerifiedNoticeRecipient("not-an-email")).toThrow("verified_recipient_required");
  });
});
