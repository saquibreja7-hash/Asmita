import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEmailDeliveryProof } from "@/lib/email-delivery-proof";
import { recordDeliveryEvent } from "@/lib/webhook-events";

// Resend webhook payload shape: https://resend.com/docs/dashboard/webhooks/event-types
const resendSchema = z.object({
  type: z.enum(["email.delivered", "email.bounced", "email.complained"]),
  data: z.object({
    email_id: z.string().min(1),
    tags: z.record(z.string(), z.string()).optional(),
  }),
});

const TYPE_MAP = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;

export async function POST(request: Request) {
  const rawBody = await request.json();
  const parsed = resendSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const eventType = TYPE_MAP[parsed.data.type];
  const messageId = parsed.data.data.email_id;
  // tags can carry platformId if set during send
  const platformId = parsed.data.data.tags?.["platformId"];

  const event = recordDeliveryEvent({ type: eventType, messageId, platformId });
  const proof = await recordEmailDeliveryProof({
    provider: "resend",
    messageId,
    eventType,
    platformId,
    rawEvent: rawBody,
  });
  return NextResponse.json({ success: true, event, proof });
}
