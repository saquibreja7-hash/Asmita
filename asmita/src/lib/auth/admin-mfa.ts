import { createHmac, timingSafeEqual } from "node:crypto";

const PERIOD_SECONDS = 30;
const DIGITS = 6;

export function verifyAdminTotp(input: { token: string; secret?: string; now?: Date; windowSteps?: number }) {
  const secret = input.secret || process.env.ADMIN_TOTP_SECRET;
  if (!secret || !/^\d{6}$/.test(input.token)) return false;

  const now = input.now || new Date();
  const windowSteps = input.windowSteps ?? 1;
  try {
    for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
      const expected = generateTotp(secret, new Date(now.getTime() + offset * PERIOD_SECONDS * 1000));
      if (safeEqual(input.token, expected)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function generateTotp(secret: string, now = new Date()) {
  const key = decodeSecret(secret);
  const counter = Math.floor(now.getTime() / 1000 / PERIOD_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function decodeSecret(secret: string) {
  if (/^[a-f0-9]{32,}$/i.test(secret) && secret.length % 2 === 0) {
    return Buffer.from(secret, "hex");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const character of clean) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("invalid_totp_secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) || [];
  return Buffer.from(bytes);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
