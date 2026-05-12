import { describe, expect, it } from "vitest";
import { createOtpForEmail, resetOtpStore, verifyOtp } from "@/lib/auth/otp";

describe("otp", () => {
  it("allows a valid OTP exactly once", async () => {
    resetOtpStore();
    const created = await createOtpForEmail("user@example.com");
    await expect(verifyOtp("user@example.com", created.token)).resolves.toBe(true);
    await expect(verifyOtp("user@example.com", created.token)).resolves.toBe(false);
  });

  it("rejects a wrong OTP", async () => {
    resetOtpStore();
    await createOtpForEmail("user@example.com");
    await expect(verifyOtp("user@example.com", "000000")).resolves.toBe(false);
  });

  it("invalidates an OTP after five failed attempts", async () => {
    resetOtpStore();
    const created = await createOtpForEmail("user@example.com");

    for (let index = 0; index < 5; index += 1) {
      await expect(verifyOtp("user@example.com", "000000")).resolves.toBe(false);
    }

    await expect(verifyOtp("user@example.com", created.token)).resolves.toBe(false);
  });
});
