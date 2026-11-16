import { afterEach, describe, expect, it } from "vitest";
import { resolveAdminRole, resolveAdminRoleByHash } from "@/lib/auth/admin-allowlist";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { hashEmail } from "@/lib/hash";

const ORIGINAL = { ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_ROLES: process.env.ADMIN_ROLES };

afterEach(() => {
  for (const [name, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("resolveAdminRole", () => {
  it("reads the configured role, case-insensitive on email", () => {
    process.env.ADMIN_EMAILS = "legal@example.org, Reviewer@Example.org";
    process.env.ADMIN_ROLES = "legal@example.org=LEGAL_ADVISOR, Reviewer@Example.org=CASE_REVIEWER";
    expect(resolveAdminRole("LEGAL@example.org")).toEqual({ ok: true, role: "LEGAL_ADVISOR" });
    expect(resolveAdminRole("reviewer@example.org")).toEqual({ ok: true, role: "CASE_REVIEWER" });
  });

  it("refuses an allowlisted email with no role instead of defaulting to SUPER_ADMIN", () => {
    process.env.ADMIN_EMAILS = "founder@example.org";
    process.env.ADMIN_ROLES = "";
    expect(resolveAdminRole("founder@example.org")).toEqual({ ok: false, reason: "role_missing" });
    process.env.ADMIN_ROLES = "founder@example.org=";
    expect(resolveAdminRole("founder@example.org")).toEqual({ ok: false, reason: "role_missing" });
  });

  it("refuses unknown or misspelled role names", () => {
    process.env.ADMIN_EMAILS = "x@example.org";
    for (const role of ["GOD_MODE", "SUPERADMIN", "super_admin"]) {
      process.env.ADMIN_ROLES = `x@example.org=${role}`;
      expect(resolveAdminRole("x@example.org")).toEqual({ ok: false, reason: "role_unknown" });
    }
  });

  it("refuses a role for an email that is not in ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "a@example.org";
    process.env.ADMIN_ROLES = "b@example.org=SUPER_ADMIN";
    expect(resolveAdminRole("b@example.org")).toEqual({ ok: false, reason: "not_allowlisted" });
  });

  it("matches a session's email hash without the raw email", () => {
    process.env.ADMIN_EMAILS = " Founder@Example.org ";
    process.env.ADMIN_ROLES = "founder@example.org=SUPER_ADMIN";
    expect(resolveAdminRoleByHash(hashEmail("founder@example.org"))).toEqual({ ok: true, role: "SUPER_ADMIN" });
    expect(resolveAdminRoleByHash("")).toEqual({ ok: false, reason: "not_allowlisted" });
    expect(resolveAdminRoleByHash("founder@example.org")).toEqual({ ok: false, reason: "not_allowlisted" });
  });
});

describe("role permission gates used by routes", () => {
  it("only GO_EDITOR and SUPER_ADMIN can edit platforms", () => {
    expect(hasAdminPermission("GO_EDITOR", "platforms:edit")).toBe(true);
    expect(hasAdminPermission("SUPER_ADMIN", "platforms:edit")).toBe(true);
    expect(hasAdminPermission("CASE_REVIEWER", "platforms:edit")).toBe(false);
    expect(hasAdminPermission("SUPPORT_AGENT", "platforms:edit")).toBe(false);
    expect(hasAdminPermission("LEGAL_ADVISOR", "platforms:edit")).toBe(false);
  });

  it("hash review/dispatch (cases:review) excludes support and legal roles", () => {
    expect(hasAdminPermission("CASE_REVIEWER", "cases:review")).toBe(true);
    expect(hasAdminPermission("SUPER_ADMIN", "cases:review")).toBe(true);
    expect(hasAdminPermission("SUPPORT_AGENT", "cases:review")).toBe(false);
    expect(hasAdminPermission("LEGAL_ADVISOR", "cases:review")).toBe(false);
    expect(hasAdminPermission("GO_EDITOR", "cases:review")).toBe(false);
  });
});
