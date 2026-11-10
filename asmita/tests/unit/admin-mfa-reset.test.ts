import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authCookie = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

import { signAdminSession } from "@/lib/auth/jwt";
import { createCsrfPair } from "@/lib/csrf";
import { hashEmail } from "@/lib/hash";
import { resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { POST as resetMfa } from "@/app/api/admin/mfa/reset/route";

const SUPER = "reset-super@example.invalid";
const WITH_ROLE = "reset-reviewer@example.invalid";
const NO_ROLE = "reset-norole@example.invalid";
const STRANGER = "reset-stranger@example.invalid";

function request(email: string) {
  const csrf = createCsrfPair();
  return new Request("https://asmita.test/api/admin/mfa/reset", {
    method: "POST",
    headers: { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/admin/mfa/reset", () => {
  const saved: Record<string, string | undefined> = {};
  const names = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA"];

  beforeEach(async () => {
    for (const name of names) saved[name] = process.env[name];
    delete process.env.DATABASE_URL;
    process.env.DEV_SKIP_ADMIN_MFA = "true";
    process.env.ADMIN_EMAILS = [SUPER, WITH_ROLE, NO_ROLE].join(",");
    process.env.ADMIN_ROLES = `${SUPER}=SUPER_ADMIN,${WITH_ROLE}=CASE_REVIEWER`;
    authCookie.token = await signAdminSession({
      sub: "synthetic-super", emailHash: hashEmail(SUPER), adminRole: "SUPER_ADMIN", mfaComplete: true,
    });
  });

  afterEach(async () => {
    for (const email of [WITH_ROLE, NO_ROLE]) await resetAdminMfa(hashEmail(email));
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("issues an enrolment code to an admin who has a valid role", async () => {
    const response = await resetMfa(request(WITH_ROLE));
    expect(response.status).toBe(200);
    expect((await response.json()).enrolmentCode).toMatch(/^\d{12}$/);
  });

  it("refuses an allowlisted email that has no role, with a specific reason", async () => {
    const response = await resetMfa(request(NO_ROLE));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("admin_role_invalid");
    expect(body.message).toContain("ADMIN_ROLES");
    expect(body).not.toHaveProperty("enrolmentCode");
  });

  it("refuses an email that is not on the admin list", async () => {
    const response = await resetMfa(request(STRANGER));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("not_an_admin");
  });
});
