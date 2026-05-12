import { afterEach, describe, expect, it } from "vitest";
import { emailDeliveryProofs, recordEmailDeliveryProof } from "@/lib/email-delivery-proof";

describe("recordEmailDeliveryProof", () => {
  afterEach(() => {
    emailDeliveryProofs.clear();
  });

  it("stores hashed delivery proof without retaining the raw provider payload", async () => {
    const rawEvent = {
      type: "delivered",
      messageId: "msg-1",
      platformId: "instagram",
      providerPayload: { recipient: "go@example.com" },
    };

    const proof = await recordEmailDeliveryProof({
      provider: "resend",
      messageId: "msg-1",
      eventType: "delivered",
      platformId: "instagram",
      rawEvent,
    });

    expect(proof.rawEventHash).toHaveLength(64);
    expect(JSON.stringify(proof)).not.toContain("go@example.com");
    expect(emailDeliveryProofs.size).toBe(1);
  });

  it("deduplicates the same provider message event", async () => {
    const input = {
      provider: "resend",
      messageId: "msg-1",
      eventType: "bounced" as const,
      rawEvent: { messageId: "msg-1", type: "bounced" },
    };

    await recordEmailDeliveryProof(input);
    await recordEmailDeliveryProof(input);

    expect(emailDeliveryProofs.size).toBe(1);
  });
});
