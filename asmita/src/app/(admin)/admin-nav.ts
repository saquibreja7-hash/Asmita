import type { AdminPermission } from "@/lib/auth/admin-permissions";

export type AdminNavItem = { href: string; label: string; permission: AdminPermission | null };
export type AdminNavGroup = { heading: string | null; items: AdminNavItem[] };

// The console's sections and what each needs. Pages check the same
// permission, so a link is hidden exactly when its page would refuse.
export const ADMIN_NAV: AdminNavGroup[] = [
  { heading: null, items: [{ href: "/admin", label: "Needs action", permission: null }] },
  {
    heading: "Work",
    items: [
      { href: "/admin/cases", label: "Cases", permission: "cases:read" },
      { href: "/admin/queue", label: "Flagged links", permission: "cases:read" },
      { href: "/admin/hashes", label: "Fingerprints", permission: "cases:read" },
    ],
  },
  {
    heading: "Directory",
    items: [
      { href: "/admin/platforms", label: "Platforms", permission: "platforms:edit" },
      { href: "/admin/templates", label: "Templates", permission: "templates:edit" },
    ],
  },
  {
    heading: "Insight",
    items: [
      { href: "/admin/metrics", label: "Response rates", permission: "metrics:read" },
      { href: "/admin/analytics", label: "Analytics", permission: "metrics:read" },
      { href: "/admin/milestones", label: "Milestones", permission: "metrics:read" },
    ],
  },
  { heading: "Oversight", items: [{ href: "/admin/audit", label: "Audit", permission: "audit:read" }] },
];
