import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "@/lib/hash";

export type NgoApiKeyRecord = {
  id: string;
  partnerName: string;
  keyHash: string;
  createdAt: string;
  revokedAt?: string;
};

export const ngoApiKeys = new Map<string, NgoApiKeyRecord>();

export function issueNgoApiKey(partnerName: string) {
  const secret = `ngo_${randomBytes(24).toString("hex")}`;
  const record: NgoApiKeyRecord = {
    id: randomBytes(8).toString("hex"),
    partnerName,
    keyHash: sha256(secret),
    createdAt: new Date().toISOString(),
  };
  ngoApiKeys.set(record.id, record);
  return { record, secret };
}

export function verifyNgoApiKey(secret: string) {
  const keyHash = sha256(secret);
  return (
    Array.from(ngoApiKeys.values()).find((record) => {
      if (record.revokedAt) return false;
      try {
        return timingSafeEqual(Buffer.from(keyHash, "hex"), Buffer.from(record.keyHash, "hex"));
      } catch {
        return false;
      }
    }) || null
  );
}
