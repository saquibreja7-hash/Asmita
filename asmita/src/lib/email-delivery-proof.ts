import { db } from "@/lib/db";
import { sha256 } from "@/lib/hash";

export type EmailDeliveryProof = {
  provider: string;
  messageId: string;
  eventType: "delivered" | "bounced" | "complained";
  platformId?: string;
  rawEventHash: string;
  receivedAt: string;
};

export const emailDeliveryProofs = new Map<string, EmailDeliveryProof>();

export async function recordEmailDeliveryProof(input: {
  provider: string;
  messageId: string;
  eventType: "delivered" | "bounced" | "complained";
  platformId?: string;
  rawEvent: unknown;
}) {
  const rawEventHash = sha256(canonicalize(input.rawEvent));
  const key = `${input.provider}:${input.messageId}:${input.eventType}:${rawEventHash}`;
  const existing = emailDeliveryProofs.get(key);
  if (existing) return existing;

  const proof: EmailDeliveryProof = {
    provider: input.provider,
    messageId: input.messageId,
    eventType: input.eventType,
    platformId: input.platformId,
    rawEventHash,
    receivedAt: new Date().toISOString(),
  };
  emailDeliveryProofs.set(key, proof);

  if (process.env.EMAIL_PROOF_PERSISTENCE === "database") {
    await db.emailDeliveryProof.upsert({
      where: {
        provider_messageId_eventType_rawEventHash: {
          provider: proof.provider,
          messageId: proof.messageId,
          eventType: proof.eventType,
          rawEventHash: proof.rawEventHash,
        },
      },
      update: {},
      create: {
        provider: proof.provider,
        messageId: proof.messageId,
        eventType: proof.eventType,
        platformId: proof.platformId,
        rawEventHash: proof.rawEventHash,
        receivedAt: new Date(proof.receivedAt),
      },
    });
  }

  return proof;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
