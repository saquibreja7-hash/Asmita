import { randomInt } from "node:crypto";
import { hashEmail, sha256 } from "@/lib/hash";

type StoredOtp = {
  emailHash: string;
  tokenHash: string;
  expiresAt: number;
  used: boolean;
  failedAttempts: number;
};

const otpStore = new Map<string, StoredOtp>();

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createOtpForEmail(email: string, ttlMinutes = 10) {
  const emailHash = hashEmail(email);
  const token = generateOtp();
  otpStore.set(emailHash, {
    emailHash,
    tokenHash: sha256(token),
    expiresAt: Date.now() + ttlMinutes * 60_000,
    used: false,
    failedAttempts: 0,
  });
  return { token, emailHash, expiresAt: new Date(Date.now() + ttlMinutes * 60_000) };
}

export async function verifyOtp(email: string, token: string) {
  const emailHash = hashEmail(email);
  const stored = otpStore.get(emailHash);
  if (!stored || stored.used || stored.expiresAt < Date.now()) {
    return false;
  }
  if (stored.tokenHash !== sha256(token)) {
    stored.failedAttempts += 1;
    if (stored.failedAttempts >= 5) {
      stored.used = true;
    }
    return false;
  }
  stored.used = true;
  return true;
}

export function resetOtpStore() {
  otpStore.clear();
}
