import { afterEach, describe, expect, it } from "vitest";
import { POST as verifyOtpPost } from "@/app/api/auth/verify-otp/route";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { createOtpForEmail, resetOtpStore } from "@/lib/auth/otp";
import { cases, users } from "@/lib/store";

describe("minor pathway storage boundary", () => {
  afterEach(() => {
    cases.clear();
    users.clear();
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
    resetOtpStore();
  });

  it("does not create user, case, URL, or audit rows for a minor session", async () => {
    const email = "minor@example.com";
    const otp = await createOtpForEmail(email);
    const csrf = createCsrfPair();

    const response = await verifyOtpPost(
      new Request("https://asmita.test/api/auth/verify-otp", {
        method: "POST",
        headers: {
          cookie: `asmita_csrf=${csrf.nonce}`,
          "content-type": "application/json",
          "x-csrf-token": csrf.token,
        },
        body: JSON.stringify({ email, otp: otp.token, ageOver18: false }),
      }),
    );
    const payload = (await response.json()) as { redirectTo: string };

    expect(response.status).toBe(200);
    expect(payload.redirectTo).toBe("/minor-support");
    expect(users.size).toBe(0);
    expect(cases.size).toBe(0);
    expect(inMemoryAuditLog).toHaveLength(0);
  });
});
