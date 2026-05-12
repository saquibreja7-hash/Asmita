import { createHash } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashEmail(email: string) {
  return sha256(email.trim().toLowerCase());
}

export function hashIp(ip: string) {
  return sha256(ip.trim());
}
