import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authCookie = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

import { signAdminSession, verifyAdminSession } from "@/lib/auth/jwt";
import { requireAdmin, requireAdminSetup } from "@/lib/auth/require-admin";
import { enrolAdminMfa, getAdminMfaSecret, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { createCsrfPair } from "@/lib/csrf";
import { POST as confirmMfa } from "@/app/api/admin/mfa/confirm/route";

const ADMIN_HASH = "synthetic-admin-hash-for-tests";

describe("admin MFA enrollment", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    await resetAdminMfa(ADMIN_HASH);
    authCookie.token = await signAdminSession({
      sub: "synthetic-admin", emailHash: ADMIN_HASH,
      adminRole: "SUPER_ADMIN", mfaComplete: false,
    });
  });

  afterEach(async () => {
    await resetAdminMfa(ADMIN_HASH);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("limits a bootstrap session to MFA setup", async () => {
    await expect(requireAdminSetup()).resolves.toMatchObject({ ok: true });
    await expect(requireAdmin()).resolves.toMatchObject({
      ok: false, error: "mfa_setup_required",
    });
  });

  it("allows a failed setup to be retried and grants admin access only after proof", async () => {
    const first = await enrolAdminMfa(ADMIN_HASH);
    expect(first).toBeTruthy();
    expect(await getAdminMfaSecret(ADMIN_HASH)).toBeNull();
    const secret = await enrolAdminMfa(ADMIN_HASH);
    expect(secret).toBeTruthy();
    expect(secret).not.toBe(first);

    const csrf = createCsrfPair();
    const request = (token: string) => new Request("https://asmita.test/api/admin/mfa/confirm", {
      method: "POST",
      headers: {
        cookie: `asmita_csrf=${csrf.nonce}`,
        "x-csrf-token": csrf.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const code = generateTotp(secret!);
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await confirmMfa(request(wrong))).status).toBe(401);
    expect(await getAdminMfaSecret(ADMIN_HASH)).toBeNull();

    const response = await confirmMfa(request(code));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=28800");
    authCookie.token = response.cookies.get("asmita_admin_session")!.value;
    expect(await verifyAdminSession(authCookie.token)).toMatchObject({ mfaComplete: true });
    await expect(requireAdmin()).resolves.toMatchObject({ ok: true });
    expect(await enrolAdminMfa(ADMIN_HASH)).toBeNull();
  });
});
