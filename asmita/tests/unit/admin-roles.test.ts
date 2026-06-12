import { afterEach, describe, expect, it } from "vitest";
import { getAdminRole } from "@/lib/auth/admin-allowlist";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";

const ORIGINAL = process.env.ADMIN_ROLES;

afterEach(() => {
  process.env.ADMIN_ROLES = ORIGINAL;
});

describe("getAdminRole", () => {
  it("defaults to SUPER_ADMIN when no mapping exists", () => {
    process.env.ADMIN_ROLES = "";
    expect(getAdminRole("founder@example.org")).toBe("SUPER_ADMIN");
  });

  it("reads the configured sub-role, case-insensitive on email", () => {
    process.env.ADMIN_ROLES =
      "legal@example.org=LEGAL_ADVISOR, Reviewer@Example.org=CASE_REVIEWER";
    expect(getAdminRole("LEGAL@example.org")).toBe("LEGAL_ADVISOR");
    expect(getAdminRole("reviewer@example.org")).toBe("CASE_REVIEWER");
  });

  it("ignores unknown role names instead of granting them", () => {
    process.env.ADMIN_ROLES = "x@example.org=GOD_MODE";
    expect(getAdminRole("x@example.org")).toBe("SUPER_ADMIN");
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
