import { afterEach, describe, expect, it } from "vitest";
import { POST as verifyAdmin } from "@/app/api/admin/auth/verify/route";
import { generateTotp, verifyAdminTotp } from "@/lib/auth/admin-mfa";
import { createOtpForEmail, resetOtpStore } from "@/lib/auth/otp";
import { createCsrfPair } from "@/lib/csrf";
import { signAdminSession, signSession, verifyAdminSession, verifySession } from "@/lib/auth/jwt";

describe("admin auth", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  const originalTotp = process.env.ADMIN_TOTP_SECRET;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
    process.env.ADMIN_TOTP_SECRET = originalTotp;
    resetOtpStore();
  });

  it("verifies TOTP codes with a configured admin secret", () => {
    const secret = "3132333435363738393031323334353637383930";
    const now = new Date("2026-05-12T10:00:00.000Z");
    const token = generateTotp(secret, now);
    expect(verifyAdminTotp({ secret, token, now, windowSteps: 0 })).toBe(true);
    expect(verifyAdminTotp({ secret, token: "000000", now, windowSteps: 0 })).toBe(false);
  });

  it("keeps victim and admin sessions in separate namespaces", async () => {
    const victim = await signSession({ sub: "user-1", role: "VICTIM", ageOver18: true, emailHash: "hash" });
    const admin = await signAdminSession({ sub: "admin-1", emailHash: "admin-hash" });

    await expect(verifySession(victim)).resolves.toMatchObject({ namespace: "victim" });
    await expect(verifyAdminSession(victim)).resolves.toBeNull();
    await expect(verifyAdminSession(admin)).resolves.toMatchObject({ namespace: "admin", role: "ADMIN" });
  });

  it("sets a separate 8-hour admin cookie after OTP and MFA", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    process.env.ADMIN_TOTP_SECRET = "3132333435363738393031323334353637383930";
    const email = "admin@example.com";
    const otp = await createOtpForEmail(email);
    const csrf = createCsrfPair();
    const totp = generateTotp(process.env.ADMIN_TOTP_SECRET);

    const response = await verifyAdmin(
      new Request("https://asmita.test/api/admin/auth/verify", {
        method: "POST",
        headers: {
          cookie: `asmita_csrf=${csrf.nonce}`,
          "x-csrf-token": csrf.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, otp: otp.token, totp }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("asmita_admin_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=28800");
  });
});
