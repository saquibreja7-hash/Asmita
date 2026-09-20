import { randomInt, timingSafeEqual } from "node:crypto";
import { hashEmail, sha256 } from "@/lib/hash";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";

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
    if (usesWorkerKysely()) {
      const workerDb = getWorkerDb();
      await workerDb.updateTable("OtpToken").set({ used: true }).where("emailHash", "=", emailHash).where("used", "=", false).execute();
      await workerDb.insertInto("OtpToken").values({
        id: randomUUID(), emailHash, tokenHash: sha256(token), expiresAt, used: false, failedAttempts: 0,
      }).execute();
      return { token, emailHash, expiresAt };
    }
    const { db } = await import("@/lib/db");
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
    if (usesWorkerKysely()) {
      const workerDb = getWorkerDb();
      const stored = await workerDb.selectFrom("OtpToken")
        .select(["id", "tokenHash", "failedAttempts"])
        .where("emailHash", "=", emailHash)
        .where("used", "=", false)
        .where("expiresAt", ">", new Date())
        .orderBy("createdAt", "desc")
        .executeTakeFirst();
      if (!stored) return false;
      if (!tokenMatchesHash(token, stored.tokenHash)) {
        const failed = await workerDb.updateTable("OtpToken")
          .set({ failedAttempts: sql<number>`"failedAttempts" + 1` })
          .where("id", "=", stored.id)
          .returning("failedAttempts")
          .executeTakeFirst();
        if ((failed?.failedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
          await workerDb.updateTable("OtpToken").set({ used: true }).where("id", "=", stored.id).execute();
        }
        return false;
      }
      const claimed = await workerDb.updateTable("OtpToken").set({ used: true }).where("id", "=", stored.id).where("used", "=", false).executeTakeFirst();
      return Number(claimed.numUpdatedRows ?? 0) === 1;
    }
    const { db } = await import("@/lib/db");
    const stored = await db.otpToken.findFirst({
      where: { emailHash, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!stored) return false;
    if (!tokenMatchesHash(token, stored.tokenHash)) {
      // Atomic increment so parallel guesses cannot exceed the limit.
      await db.otpToken.update({
        where: { id: stored.id },
        data: { failedAttempts: { increment: 1 } },
      });
      await db.otpToken.updateMany({
        where: { id: stored.id, failedAttempts: { gte: MAX_FAILED_ATTEMPTS } },
        data: { used: true },
      });
      return false;
    }
    // Claim the token atomically: a concurrent duplicate verify gets count 0.
    const claimed = await db.otpToken.updateMany({
      where: { id: stored.id, used: false },
      data: { used: true },
    });
    return claimed.count === 1;
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
