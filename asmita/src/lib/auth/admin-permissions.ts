export type AdminRole =
  | "SUPER_ADMIN"
  | "LEGAL_ADVISOR"
  | "CASE_REVIEWER"
  | "GO_EDITOR"
  | "SUPPORT_AGENT";

export type AdminPermission =
  | "cases:read"
  | "cases:review"
  | "cases:note"
  | "templates:edit"
  | "templates:activate"
  | "platforms:edit"
  | "metrics:read"
  | "users:manage"
  | "audit:read";

const rolePermissions: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  SUPER_ADMIN: new Set([
    "cases:read",
    "cases:review",
    "cases:note",
    "templates:edit",
    "templates:activate",
    "platforms:edit",
    "metrics:read",
    "users:manage",
    "audit:read",
  ]),
  LEGAL_ADVISOR: new Set(["cases:read", "templates:edit", "templates:activate", "audit:read"]),
  CASE_REVIEWER: new Set(["cases:read", "cases:review", "audit:read"]),
  GO_EDITOR: new Set(["platforms:edit", "metrics:read", "audit:read"]),
  SUPPORT_AGENT: new Set(["cases:read", "cases:note"]),
};

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return rolePermissions[role].has(permission);
}

export function listAdminPermissions(role: AdminRole) {
  return Array.from(rolePermissions[role]);
}

export function canActivateTemplate(role: AdminRole, reviewedByLegal: boolean) {
  return reviewedByLegal && hasAdminPermission(role, "templates:activate");
}
