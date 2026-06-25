import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEmailDeliveryProof } from "@/lib/email-delivery-proof";
import { recordDeliveryEvent } from "@/lib/webhook-events";

// Resend webhooks are signed via svix: https://docs.svix.com/receiving/verifying-payloads/how
function verifyResendSignature(request: Request, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // In dev without a secret configured, skip verification but log it.
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const msgId = request.headers.get("svix-id") ?? "";
  const msgTimestamp = request.headers.get("svix-timestamp") ?? "";
  const msgSignature = request.headers.get("svix-signature") ?? "";
  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Reject timestamps older than 5 minutes to prevent replay attacks.
  const ts = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
  // Secret is base64-encoded after the "whsec_" prefix per svix spec.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = createHmac("sha256", secretBytes).update(toSign).digest("base64");

  // svix-signature may be a space-separated list of "v1,<base64>" entries.
  const signatures = msgSignature.split(" ").map((s) => s.replace(/^v1,/, ""));
  return signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

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
  const bodyText = await request.text();
  if (!verifyResendSignature(request, bodyText)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
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
