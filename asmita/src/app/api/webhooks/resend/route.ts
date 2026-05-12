import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEmailDeliveryProof } from "@/lib/email-delivery-proof";
import { recordDeliveryEvent } from "@/lib/webhook-events";

const schema = z.object({
  type: z.enum(["bounced", "complained", "delivered"]),
  messageId: z.string().min(1),
  platformId: z.string().optional(),
});

export async function POST(request: Request) {
  const rawBody = await request.json();
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const event = recordDeliveryEvent(parsed.data);
  const proof = await recordEmailDeliveryProof({
    provider: "resend",
    messageId: parsed.data.messageId,
    eventType: parsed.data.type,
    platformId: parsed.data.platformId,
    rawEvent: rawBody,
  });
  return NextResponse.json({ success: true, event, proof });
}
