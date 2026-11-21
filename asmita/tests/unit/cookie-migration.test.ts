// S9 cookie migration: __Host- names in production, one-release legacy
// fallback for readers, and logout routes that clear both names. Synthetic
// identities and secrets only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (fake.cookies[name] !== undefined ? { value: fake.cookies[name] } : undefined),
  }),
}));
vi.mock("@/lib/case-ops");
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import * as caseOps from "@/lib/case-ops";
import { GET as csrfRoute } from "@/app/api/csrf/route";
import { POST as survivorLogout } from "@/app/api/auth/logout/route";
import { POST as adminLogout } from "@/app/api/admin/auth/logout/route";
import { POST as deleteAccount } from "@/app/api/account/delete/route";
import { requireSession } from "@/lib/auth/middleware";
import { requireAdminSetup } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { signAdminSession, signSession } from "@/lib/auth/jwt";
import { hashEmail } from "@/lib/hash";

const CSRF_SECRET = "synthetic-csrf-secret-0123456789abcdef";
const JWT_SECRET = "synthetic-jwt-secret-0123456789abcdef";
const ADMIN_EMAIL = "migration-admin@example.invalid";
const ADMIN_HASH = hashEmail(ADMIN_EMAIL);
const SAVED_ENV = {
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  ADMIN_ROLES: process.env.ADMIN_ROLES,
};

function productionEnv() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CSRF_SECRET", CSRF_SECRET);
  vi.stubEnv("JWT_SECRET", JWT_SECRET);
}

function csrfPost(path: string, cookieName = "asmita_csrf") {
  const pair = createCsrfPair();
  return {
    pair,
    request: new Request(`https://asmita.test${path}`, {
      method: "POST",
      headers: { cookie: `${cookieName}=${pair.nonce}`, "x-csrf-token": pair.token },
    }),
  };
}

beforeEach(() => {
  fake.cookies = {};
  vi.mocked(caseOps.getSessionUserStatus).mockResolvedValue("active");
  vi.mocked(caseOps.deactivateUser).mockResolvedValue({
    deactivatedAt: "2026-11-20T00:00:00.000Z",
    hardDeleteAfter: "2026-12-21T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const name of ["ADMIN_EMAILS", "ADMIN_ROLES"] as const) {
    if (SAVED_ENV[name] === undefined) delete process.env[name];
    else process.env[name] = SAVED_ENV[name];
  }
});

describe("GET /api/csrf cookie name", () => {
  it("uses the plain name outside production", async () => {
    const response = await csrfRoute();
    const setCookie = response.headers.getSetCookie();
    expect(setCookie.some((cookie) => cookie.startsWith("asmita_csrf="))).toBe(true);
    expect(setCookie.some((cookie) => cookie.startsWith("__Host-"))).toBe(false);
  });

  it("uses the __Host- name with Secure and Path=/ in production", async () => {
    productionEnv();
    const response = await csrfRoute();
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith("__Host-asmita_csrf="));
    expect(cookie).toBeDefined();
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
  });
});

describe("session cookie readers in production", () => {
  it("requireSession reads the __Host- name", async () => {
    productionEnv();
    fake.cookies["__Host-asmita_session"] = await signSession({
      sub: "user-synthetic", role: "VICTIM", ageOver18: true, emailHash: "synthetic-hash",
    });
    await expect(requireSession()).resolves.toMatchObject({ ok: true, session: { sub: "user-synthetic" } });
  });

  it("requireSession also accepts the pre-__Host- name, for one release", async () => {
    productionEnv();
    fake.cookies.asmita_session = await signSession({
      sub: "user-synthetic", role: "VICTIM", ageOver18: true, emailHash: "synthetic-hash",
    });
    await expect(requireSession()).resolves.toMatchObject({ ok: true, session: { sub: "user-synthetic" } });
  });

  it("requireAdminSetup also accepts the pre-__Host- name, for one release", async () => {
    productionEnv();
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    process.env.ADMIN_ROLES = `${ADMIN_EMAIL}=SUPER_ADMIN`;
    fake.cookies.asmita_admin_session = await signAdminSession({
      sub: "admin-synthetic", emailHash: ADMIN_HASH, adminRole: "SUPER_ADMIN", mfaComplete: true,
    });
    await expect(requireAdminSetup()).resolves.toMatchObject({
      ok: true,
      session: { sub: "admin-synthetic", adminRole: "SUPER_ADMIN" },
    });
  });
});

describe("logout clears both names in production", () => {
  it("survivor logout clears the __Host- name, the legacy name and eligibility", async () => {
    productionEnv();
    const { request } = csrfPost("/api/auth/logout", "__Host-asmita_csrf");
    const response = await survivorLogout(request);
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    const current = cookies.find((c) => c.startsWith("__Host-asmita_session="));
    const legacy = cookies.find((c) => c.startsWith("asmita_session="));
    expect(current).toContain("Max-Age=0");
    expect(current).toContain("Path=/");
    expect(current).toContain("Secure");
    expect(legacy).toContain("Max-Age=0");
    expect(cookies.find((c) => c.startsWith("asmita_eligible="))).toContain("Max-Age=0");
  });

  it("survivor logout outside production clears exactly the plain name", async () => {
    const { request } = csrfPost("/api/auth/logout");
    const response = await survivorLogout(request);
    const cookies = response.headers.getSetCookie();
    expect(cookies.filter((c) => c.startsWith("asmita_session="))).toHaveLength(1);
    expect(cookies.some((c) => c.startsWith("__Host-"))).toBe(false);
  });

  it("admin logout clears both names and the old /admin-scoped cookie", async () => {
    productionEnv();
    const { request } = csrfPost("/api/admin/auth/logout", "__Host-asmita_csrf");
    const response = await adminLogout(request);
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    const current = cookies.find((c) => c.startsWith("__Host-asmita_admin_session="));
    const legacy = cookies.find((c) => c.startsWith("asmita_admin_session="));
    expect(current).toContain("Max-Age=0");
    expect(current).toContain("Secure");
    expect(legacy).toContain("Max-Age=0");
    // The much older /admin-scoped sessions only ever existed under the plain name.
    const adminScoped = cookies.find((c) => c.includes("Path=/admin"));
    expect(adminScoped).toBe("asmita_admin_session=; Path=/admin; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
  });

  it("account deletion clears both session names", async () => {
    productionEnv();
    fake.cookies["__Host-asmita_session"] = await signSession({
      sub: "user-synthetic", role: "VICTIM", ageOver18: true, emailHash: "synthetic-hash",
    });
    const { request } = csrfPost("/api/account/delete", "__Host-asmita_csrf");
    const response = await deleteAccount(request);
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.find((c) => c.startsWith("__Host-asmita_session="))).toContain("Max-Age=0");
    expect(cookies.find((c) => c.startsWith("asmita_session="))).toContain("Max-Age=0");
  });
});
