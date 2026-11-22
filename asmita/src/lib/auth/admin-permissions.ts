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
  | "audit:read"
  // Review crawler findings (src/lib/crawl-findings.ts).
  | "findings:review"
  // Manage the sites the crawler visits (src/lib/crawl-sources.ts).
  | "crawler:manage"
  // Manage the AI Lab (docs/lab/charter.md): E2 services, chokepoints,
  // reports and its dashboard. SUPER_ADMIN only.
  | "lab:manage"
  // Manage the review console's own configuration (review-console-spec.md
  // WP143): routing rules, custom queues and (WP144) reasons and access.
  // SUPER_ADMIN only.
  | "review:manage";

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
    "findings:review",
    "crawler:manage",
    "lab:manage",
    "review:manage",
  ]),
  LEGAL_ADVISOR: new Set(["cases:read", "templates:edit", "templates:activate", "audit:read"]),
  CASE_REVIEWER: new Set(["cases:read", "cases:review", "audit:read", "findings:review"]),
  GO_EDITOR: new Set(["platforms:edit", "metrics:read", "audit:read"]),
  SUPPORT_AGENT: new Set(["cases:read", "cases:note"]),
};

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return rolePermissions[role].has(permission);
}

export function listAdminPermissions(role: AdminRole) {
  return Array.from(rolePermissions[role]);
}

/** Every role, in display order (the Admins page's permission matrix, WP144). */
export const ALL_ADMIN_ROLES: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "LEGAL_ADVISOR",
  "CASE_REVIEWER",
  "GO_EDITOR",
  "SUPPORT_AGENT",
];

/** Every permission, in display order (the Admins page's matrix, WP144). */
export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "cases:read",
  "cases:review",
  "cases:note",
  "findings:review",
  "crawler:manage",
  "platforms:edit",
  "templates:edit",
  "templates:activate",
  "metrics:read",
  "audit:read",
  "users:manage",
  "lab:manage",
  "review:manage",
];

export function canActivateTemplate(role: AdminRole, reviewedByLegal: boolean) {
  return reviewedByLegal && hasAdminPermission(role, "templates:activate");
}
