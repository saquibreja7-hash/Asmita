import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/resend/route";
import { emailDeliveryProofs } from "@/lib/email-delivery-proof";
import { deliveryEvents, recordDeliveryEvent, stalePlatforms } from "@/lib/webhook-events";

describe("recordDeliveryEvent", () => {
  afterEach(() => {
    deliveryEvents.length = 0;
    stalePlatforms.clear();
    emailDeliveryProofs.clear();
  });

  it("marks a platform stale when a notice bounces", () => {
    recordDeliveryEvent({ type: "bounced", messageId: "msg-1", platformId: "platform-1" });
    expect(stalePlatforms.has("platform-1")).toBe(true);
  });

  it("records delivery proof from the Resend webhook route", async () => {
    const response = await POST(
      new Request("https://example.test/api/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.delivered", data: { email_id: "msg-1", tags: { platformId: "platform-1" } } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.proof.rawEventHash).toHaveLength(64);
    expect(emailDeliveryProofs.size).toBe(1);
  });
});
