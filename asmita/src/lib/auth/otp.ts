import { randomInt, timingSafeEqual } from "node:crypto";
import { hashEmail, sha256 } from "@/lib/hash";
import { db } from "@/lib/db";

type StoredOtp = {
  emailHash: string;
  tokenHash: string;
  expiresAt: number;
  used: boolean;
  failedAttempts: number;
};

// globalThis-backed: in dev, the bundler gives each API route its own module
// instance, so a plain module-level Map would split into per-route stores
// (request-otp writes to one, verify-otp reads another). Same pattern as store.ts.
const otpGlobals = globalThis as typeof globalThis & {
  __asmitaOtpStore?: Map<string, StoredOtp>;
};
const otpStore = (otpGlobals.__asmitaOtpStore ??= new Map<string, StoredOtp>());
const MAX_FAILED_ATTEMPTS = 5;

// Vercel serverless functions are stateless: the in-memory store only works
// for local dev (request-otp and verify may land on different instances in
// production). Set OTP_PERSISTENCE=database in production.
function databasePersistenceEnabled() {
  return process.env.OTP_PERSISTENCE === "database";
}

function tokenMatchesHash(token: string, storedHashHex: string) {
  const submitted = Buffer.from(sha256(token), "hex");
  const stored = Buffer.from(storedHashHex, "hex");
  return submitted.length === stored.length && timingSafeEqual(submitted, stored);
}

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createOtpForEmail(email: string, ttlMinutes = 10) {
  const emailHash = hashEmail(email);
  const token = generateOtp();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  if (databasePersistenceEnabled()) {
    // One live OTP per email: invalidate any previous tokens.
    await db.otpToken.updateMany({
      where: { emailHash, used: false },
      data: { used: true },
    });
    await db.otpToken.create({
      data: { emailHash, tokenHash: sha256(token), expiresAt },
    });
  } else {
    otpStore.set(emailHash, {
      emailHash,
      tokenHash: sha256(token),
      expiresAt: expiresAt.getTime(),
      used: false,
      failedAttempts: 0,
    });
  }
  return { token, emailHash, expiresAt };
}

export async function verifyOtp(email: string, token: string) {
  const emailHash = hashEmail(email);

  if (databasePersistenceEnabled()) {
    const stored = await db.otpToken.findFirst({
      where: { emailHash, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!stored) return false;
    if (!tokenMatchesHash(token, stored.tokenHash)) {
      const failedAttempts = stored.failedAttempts + 1;
      await db.otpToken.update({
        where: { id: stored.id },
        data: {
          failedAttempts,
          used: failedAttempts >= MAX_FAILED_ATTEMPTS,
        },
      });
      return false;
    }
    await db.otpToken.update({ where: { id: stored.id }, data: { used: true } });
    return true;
  }

  const stored = otpStore.get(emailHash);
  if (!stored || stored.used || stored.expiresAt < Date.now()) {
    return false;
  }
  if (!tokenMatchesHash(token, stored.tokenHash)) {
    stored.failedAttempts += 1;
    if (stored.failedAttempts >= MAX_FAILED_ATTEMPTS) {
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
