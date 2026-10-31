import { describe, expect, it } from "vitest";
import { generateBase32Secret } from "@/lib/auth/admin-mfa-store";
import { generateTotp, verifyAdminTotp } from "@/lib/auth/admin-mfa";


describe("per-admin MFA secrets", () => {
  it("generates a base32 secret an authenticator app accepts", () => {
    const secret = generateBase32Secret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateBase32Secret()).not.toBe(secret);
  });

  it("verifies against the admin's own secret, not the shared one", () => {
    const own = generateBase32Secret();
    const shared = generateBase32Secret();
    process.env.ADMIN_TOTP_SECRET = shared;
    const now = new Date("2026-09-06T00:00:00Z");
    const ownCode = generateTotp(own, now);
    expect(verifyAdminTotp({ token: ownCode, secret: own, now, windowSteps: 0 })).toBe(true);
    // A code from the shared secret must not pass when an own secret is supplied.
    const sharedCode = generateTotp(shared, now);
    if (sharedCode !== ownCode) {
      expect(verifyAdminTotp({ token: sharedCode, secret: own, now, windowSteps: 0 })).toBe(false);
    }
  });
});
