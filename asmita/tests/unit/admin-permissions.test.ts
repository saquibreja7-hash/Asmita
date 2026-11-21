import { describe, expect, it } from "vitest";
import { canActivateTemplate, hasAdminPermission, listAdminPermissions } from "@/lib/auth/admin-permissions";

describe("admin permissions", () => {
  it("grants least-privilege permissions by admin role", () => {
    expect(hasAdminPermission("SUPER_ADMIN", "users:manage")).toBe(true);
    expect(hasAdminPermission("LEGAL_ADVISOR", "templates:activate")).toBe(true);
    expect(hasAdminPermission("CASE_REVIEWER", "templates:activate")).toBe(false);
    expect(hasAdminPermission("GO_EDITOR", "platforms:edit")).toBe(true);
    expect(hasAdminPermission("SUPPORT_AGENT", "templates:edit")).toBe(false);
  });

  it("blocks template activation until legal review is complete", () => {
    expect(canActivateTemplate("LEGAL_ADVISOR", false)).toBe(false);
    expect(canActivateTemplate("LEGAL_ADVISOR", true)).toBe(true);
    expect(canActivateTemplate("CASE_REVIEWER", true)).toBe(false);
  });

  it("exposes permission lists for admin UI badges and tests", () => {
    expect(listAdminPermissions("GO_EDITOR")).toEqual(["platforms:edit", "metrics:read", "audit:read"]);
  });

  it("grants the AI Lab to SUPER_ADMIN only", () => {
    expect(hasAdminPermission("SUPER_ADMIN", "lab:manage")).toBe(true);
    expect(listAdminPermissions("SUPER_ADMIN")).toContain("lab:manage");
    for (const role of ["LEGAL_ADVISOR", "CASE_REVIEWER", "GO_EDITOR", "SUPPORT_AGENT"] as const) {
      expect(hasAdminPermission(role, "lab:manage")).toBe(false);
    }
  });
});
