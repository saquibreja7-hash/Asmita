import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authCookie = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

import { SignJWT } from "jose";
import { signAdminSession } from "@/lib/auth/jwt";
import { requireAdmin, requireAdminPermission } from "@/lib/auth/require-admin";
import { confirmAdminMfa, enrolAdminMfa, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { createCsrfPair } from "@/lib/csrf";
import { hashEmail } from "@/lib/hash";
import { securityEvents } from "@/lib/security-log";
import { POST as requestAdminOtp } from "@/app/api/admin/auth/request-otp/route";
import { POST as verifyAdmin } from "@/app/api/admin/auth/verify/route";

// Synthetic identities only.
const ADMIN_EMAIL = "role-admin@example.invalid";
const ADMIN_HASH = hashEmail(ADMIN_EMAIL);
const ENV_NAMES = ["ADMIN_EMAILS", "ADMIN_ROLES", "DATABASE_URL", "DEV_SKIP_ADMIN_MFA"] as const;
const original = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

function configure(emails: string, roles: string) {
  process.env.ADMIN_EMAILS = emails;
  process.env.ADMIN_ROLES = roles;
}

function adminRequest(path: string, body: unknown) {
  const csrf = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers: { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin authorization uses the allowlist as configured now", () => {
  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DEV_SKIP_ADMIN_MFA;
    configure(ADMIN_EMAIL, `${ADMIN_EMAIL}=SUPER_ADMIN`);
    await resetAdminMfa(ADMIN_HASH);
    const secret = await enrolAdminMfa(ADMIN_HASH);
    expect(await confirmAdminMfa(ADMIN_HASH, generateTotp(secret!))).toBe(true);
    authCookie.token = await signAdminSession({
      sub: "admin-synthetic", emailHash: ADMIN_HASH, adminRole: "SUPER_ADMIN", mfaComplete: true,
    });
    securityEvents.length = 0;
  });

  afterEach(async () => {
    await resetAdminMfa(ADMIN_HASH);
    for (const name of ENV_NAMES) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });

  it("lets a configured admin through with the configured role", async () => {
    await expect(requireAdminPermission("users:manage")).resolves.toMatchObject({
      ok: true, session: { adminRole: "SUPER_ADMIN" },
    });
  });

  it("refuses an admin removed from ADMIN_EMAILS mid-session", async () => {
    configure("someone-else@example.invalid", "someone-else@example.invalid=SUPER_ADMIN");
    await expect(requireAdmin()).resolves.toMatchObject({ ok: false, status: 403, error: "admin_required" });
    expect(securityEvents.at(-1)).toMatchObject({ event: "admin_denied", actorHash: ADMIN_HASH, reason: "not_allowlisted" });
  });

  it("applies a downgrade on the next request, whatever the token says", async () => {
    configure(ADMIN_EMAIL, `${ADMIN_EMAIL}=CASE_REVIEWER`);
    await expect(requireAdminPermission("users:manage")).resolves.toMatchObject({ ok: false, error: "permission_denied" });
    await expect(requireAdminPermission("cases:review")).resolves.toMatchObject({
      ok: true, session: { adminRole: "CASE_REVIEWER" },
    });
  });

  it("refuses a session whose role is no longer valid in ADMIN_ROLES", async () => {
    configure(ADMIN_EMAIL, `${ADMIN_EMAIL}=SUPERADMIN`);
    await expect(requireAdmin()).resolves.toMatchObject({ ok: false, error: "admin_required" });
    expect(securityEvents.at(-1)).toMatchObject({ event: "admin_denied", reason: "role_unknown" });
  });

  it("gives a session without an adminRole claim no access", async () => {
    authCookie.token = await new SignJWT({
      role: "ADMIN", ageOver18: true, emailHash: ADMIN_HASH, namespace: "admin", mfaComplete: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("asmita")
      .setAudience("asmita-web")
      .setSubject("admin-synthetic")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-before-prod-32chars"));
    await expect(requireAdminPermission("cases:read")).resolves.toMatchObject({ ok: false, error: "admin_required" });
    expect(securityEvents.at(-1)).toMatchObject({ event: "admin_denied", reason: "session_role_missing" });
  });

  it.each([
    ["no ADMIN_ROLES entry", "", "role_missing"],
    ["a misspelled role", `${ADMIN_EMAIL}=Super_Admin`, "role_unknown"],
  ])("gives an allowlisted email with %s the generic reply and logs only the hash", async (_label, roles, reason) => {
    configure(ADMIN_EMAIL, roles);
    const otpResponse = await requestAdminOtp(adminRequest("/api/admin/auth/request-otp", { email: ADMIN_EMAIL }));
    expect(otpResponse.status).toBe(200);
    expect(await otpResponse.json()).toEqual({ success: true });
    expect(securityEvents.at(-1)).toMatchObject({ event: "admin_denied", route: "/api/admin/auth/request-otp", actorHash: ADMIN_HASH, reason });
    const verifyResponse = await verifyAdmin(adminRequest("/api/admin/auth/verify", { email: ADMIN_EMAIL, otp: "123456", totp: "123456" }));
    expect(verifyResponse.status).toBe(401);
    expect(await verifyResponse.json()).toEqual({ error: "invalid_credentials" });
    expect(securityEvents.at(-1)).toMatchObject({ event: "admin_denied", route: "/api/admin/auth/verify", actorHash: ADMIN_HASH, reason });
    expect(JSON.stringify(securityEvents)).not.toContain(ADMIN_EMAIL);
  });

  it("answers an email that is not allowlisted the same way, without recording its hash", async () => {
    const response = await requestAdminOtp(adminRequest("/api/admin/auth/request-otp", { email: "stranger@example.invalid" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(securityEvents.at(-1)).toEqual(expect.objectContaining({ event: "admin_denied" }));
    expect(securityEvents.at(-1)?.actorHash).toBeUndefined();
  });
});
