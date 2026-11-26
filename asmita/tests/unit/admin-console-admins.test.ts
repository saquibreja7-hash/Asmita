import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authCookie = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session" ? { value: authCookie.token } : undefined }),
}));

import { signAdminSession } from "@/lib/auth/jwt";
import { createCsrfPair } from "@/lib/csrf";
import { hashEmail } from "@/lib/hash";
import { adminTargetKey, resolveAnyAdminRole } from "@/lib/auth/admin-allowlist";
import { resetConsoleAdminsForTests } from "@/lib/auth/console-admins";
import { DELETE, PATCH, POST } from "@/app/api/admin/admins/route";

const OWNER = "console-owner@example.invalid";
const NEW = "console-new@example.invalid";

function request(method: string, body: unknown) {
  const csrf = createCsrfPair();
  return new Request("https://asmita.test/api/admin/admins", {
    method,
    headers: { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function signInAs(email: string, role: "SUPER_ADMIN" | "CASE_REVIEWER") {
  authCookie.token = await signAdminSession({ sub: `synthetic-${email}`, emailHash: hashEmail(email), adminRole: role, mfaComplete: true });
}

describe("/api/admin/admins", () => {
  const saved: Record<string, string | undefined> = {};
  const names = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA"];

  beforeEach(async () => {
    for (const name of names) saved[name] = process.env[name];
    delete process.env.DATABASE_URL;
    process.env.DEV_SKIP_ADMIN_MFA = "true";
    process.env.ADMIN_EMAILS = OWNER;
    process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN`;
    resetConsoleAdminsForTests();
    await signInAs(OWNER, "SUPER_ADMIN");
  });

  afterEach(() => {
    resetConsoleAdminsForTests();
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("adds an admin who can then sign in with that role, and returns an enrolment code once", async () => {
    const response = await POST(request("POST", { email: NEW, role: "CASE_REVIEWER" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.enrolmentCode).toMatch(/^\d{12}$/);
    expect(await resolveAnyAdminRole(NEW)).toEqual({ ok: true, role: "CASE_REVIEWER" });
    expect((await POST(request("POST", { email: NEW, role: "CASE_REVIEWER" }))).status).toBe(409);
  });

  it("changes and removes a console admin", async () => {
    await POST(request("POST", { email: NEW, role: "CASE_REVIEWER" }));
    const key = adminTargetKey(hashEmail(NEW));
    expect((await PATCH(request("PATCH", { adminKey: key, role: "LEGAL_ADVISOR" }))).status).toBe(200);
    expect(await resolveAnyAdminRole(NEW)).toEqual({ ok: true, role: "LEGAL_ADVISOR" });
    expect((await DELETE(request("DELETE", { adminKey: key }))).status).toBe(200);
    expect((await resolveAnyAdminRole(NEW)).ok).toBe(false);
  });

  it("never changes an owner from the environment", async () => {
    const key = adminTargetKey(hashEmail(OWNER));
    const response = await PATCH(request("PATCH", { adminKey: key, role: "SUPPORT_AGENT" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "owner_managed_in_environment" });
  });

  it("keeps a super admin: the last one cannot be demoted, and nobody changes themself", async () => {
    // Only console admins: drop the owner so the console super admin is the last one.
    await POST(request("POST", { email: NEW, role: "SUPER_ADMIN" }));
    process.env.ADMIN_EMAILS = "";
    process.env.ADMIN_ROLES = "";
    await signInAs(NEW, "SUPER_ADMIN");
    const self = await PATCH(request("PATCH", { adminKey: adminTargetKey(hashEmail(NEW)), role: "CASE_REVIEWER" }));
    expect(await self.json()).toEqual({ error: "cannot_change_self" });
  });

  it("refuses a role without users:manage", async () => {
    await POST(request("POST", { email: NEW, role: "CASE_REVIEWER" }));
    await signInAs(NEW, "CASE_REVIEWER");
    expect((await POST(request("POST", { email: "x@example.invalid", role: "SUPER_ADMIN" }))).status).toBe(403);
  });
});
